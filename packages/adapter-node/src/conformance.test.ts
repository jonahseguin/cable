import { once } from "node:events";
import type { IncomingMessage } from "node:http";
import { createServer } from "node:http";
import { connect } from "node:net";
import type { AddressInfo } from "node:net";

import {
  CONFORMANCE_POLICY,
  CONFORMANCE_LIMITS,
  conformanceChannel,
  createConformanceImplementation,
  ordinaryHostConformance,
  type ConformanceGrant,
  type ConformanceSocket,
  type ConformanceUpgrade,
  type HostConformanceDriver,
} from "@cablejs/conformance";
import {
  channelKey,
  decodeHostFrame,
  encodeClientFrame,
  signGrant,
  type ClientFrame,
  type GrantId,
  type HostKey,
  type HostLimits,
  type HostWireFrame,
  type SignedGrant,
  type PeerMessage,
  type StorageListOptions,
} from "@cablejs/core";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { createNodeHostTransport, nodeRequest } from "./handler.internal.js";
import { nodeHost, NodeRuntime } from "./runtime.js";

const grantSecret = "node-conformance-secret-material-32-bytes";
const activeServers = new Set<NodeConformanceServer>();
let nextRoom = 0;

class NodeConformanceSocket implements ConformanceSocket {
  private readonly frames: HostWireFrame[] = [];
  private readonly socket: WebSocket;
  private readonly waiting: Array<(frame: HostWireFrame) => void> = [];

  public constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on("message", (data) => {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof, typescript/no-base-to-string -- ws RawData is the native boundary.
      const text = typeof data === "string" ? data : data.toString();
      this.push(decodeHostFrame(text));
    });
  }

  public async close(code?: number, reason?: string): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const closed = once(this.socket, "close");
    this.socket.close(code, reason);
    await closed;
  }

  public next(): Promise<HostWireFrame> {
    const frame = this.frames.shift();
    return frame === undefined
      ? new Promise((resolve) => {
          this.waiting.push(resolve);
        })
      : Promise.resolve(frame);
  }

  public waitForClose(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.once("close", () => resolve());
    });
  }

  public send(frame: ClientFrame | string | ArrayBuffer): Promise<void> {
    const data =
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This driver accepts typed and intentionally malformed wire representations.
      typeof frame === "string" || frame instanceof ArrayBuffer ? frame : encodeClientFrame(frame);
    return new Promise((resolve, reject) => {
      this.socket.send(data, (error) => {
        // `ws` supplies null on successful sends despite its Error | undefined declaration.
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- This is the observed native callback contract.
        if (error === undefined || error === null) resolve();
        else reject(error);
      });
    });
  }

  private push(frame: HostWireFrame): void {
    const resolve = this.waiting.shift();
    if (resolve === undefined) this.frames.push(frame);
    else resolve(frame);
  }
}

class NodeConformanceServer implements HostConformanceDriver {
  public readonly capabilities = Object.freeze({ injectSendFailure: false });
  public readonly key: HostKey;
  public readonly limits: HostLimits;
  private baseUrl = "";
  private readonly runtime: NodeRuntime;
  private readonly server = createServer();
  private readonly webSocketServer = new WebSocketServer({ noServer: true });
  private closed = false;

  private constructor(roomId: string, runtime: NodeRuntime, host: ReturnType<typeof nodeHost>) {
    this.key = channelKey(conformanceChannel, { roomId });
    this.runtime = runtime;
    this.server.on("upgrade", (request, socket, head) => {
      const grant = grantFromRequest(request);
      if (grant === undefined) {
        socket.destroy();
        return;
      }
      const transport = createNodeHostTransport(host, runtime, this.webSocketServer);
      void transport
        .upgrade(this.key, nodeRequest(request), grant, { head, request, socket })
        // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Raw socket failures have no structured error contract.
        .catch((error: unknown) => socket.destroy(error instanceof Error ? error : undefined));
    });
    this.limits = CONFORMANCE_LIMITS;
  }

  public static async create(): Promise<NodeConformanceServer> {
    const roomId = `node-${String(++nextRoom)}`;
    let nextId = 0;
    const host = nodeHost(conformanceChannel, createConformanceImplementation(), {
      engine: {
        handshakeTimeoutMs: CONFORMANCE_POLICY.handshakeTimeoutMs,
        presenceSweepMs: 60_000,
        randomId: () => `${"\0".repeat(119)}${String(++nextId).padStart(8, "0")}`,
        replayChunkBytes: CONFORMANCE_POLICY.replayChunkBytes,
        timerRetryMs: CONFORMANCE_POLICY.timerRetryMs,
      },
    });
    const runtime = new NodeRuntime([host], { grantSecret, limits: CONFORMANCE_LIMITS });
    const server = new NodeConformanceServer(roomId, runtime, host);
    await new Promise<void>((resolve) => server.server.listen(0, "127.0.0.1", resolve));
    const address = server.server.address();
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Node documents Server.address as null|string|AddressInfo.
    if (address === null || typeof address === "string")
      throw new Error("Node conformance server has no TCP address.");
    // SAFETY: The preceding union check establishes AddressInfo.
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- AddressInfo supplies the bound port.
    server.baseUrl = `http://127.0.0.1:${String((address as AddressInfo).port)}`;
    return server;
  }

  public async failNativeAcceptance(): Promise<void> {
    const grant = await this.grant("valid");
    const address = new URL(this.baseUrl);
    const socket = connect(Number.parseInt(address.port, 10), address.hostname);
    await once(socket, "connect");
    socket.write(
      [
        `GET /_cable/ws?ch=${encodeURIComponent(this.key)}&params=${encodeURIComponent(JSON.stringify({ roomId: this.roomId() }))} HTTP/1.1`,
        `Host: ${address.host}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: malformed",
        `x-cable-grant: ${grant.payload}.${grant.sig}`,
        "",
        "",
      ].join("\r\n"),
    );
    await Promise.race([
      once(socket, "close"),
      new Promise<void>((resolve) => setTimeout(resolve, 25)),
    ]);
    socket.destroy();
  }

  public async waitForReservedGrant(): Promise<void> {
    const deadline = Date.now() + CONFORMANCE_POLICY.handshakeTimeoutMs;
    while (Date.now() < deadline) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Polling observes the durable reservation before its deadline.
      if ((await this.storageList({ prefix: "gr:" })).size === 1) return;
      // oxlint-disable-next-line eslint/no-await-in-loop -- Polling observes the durable reservation before its deadline.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("Malformed native upgrade did not leave a pending grant reservation.");
  }

  public async attachmentLimitProbe(): Promise<void> {
    const connection = Array.from(this.host().connections())[0];
    if (connection === undefined) throw new Error("Expected a live Node connection.");
    const attachment = connection.attachment.get();
    if (attachment === undefined) throw new Error("Expected a live Node attachment.");
    // SAFETY: This shared fixture deliberately exceeds the adapter attachment limit.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GrantId brands a tested string value.
    const grantId = "g".repeat(this.limits.attachmentBytes + 1) as GrantId;
    connection.attachment.set({
      cid: attachment.cid,
      grantId,
      phase: attachment.phase,
      // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- Tests preserve the exact optional Attachment wire shape.
      ...(attachment.since === undefined ? {} : { since: attachment.since }),
      v: attachment.v,
    });
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.runtime.shutdown();
    if (this.webSocketServer.clients.size !== 0)
      await new Promise<void>((resolve) => this.webSocketServer.close(() => resolve()));
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) =>
        // `ws` supplies null on success despite its Error | undefined declaration.
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- This is the observed native callback contract.
        error === undefined || error === null ? resolve() : reject(error),
      ),
    );
  }

  public connectionCount(): Promise<number> {
    return Promise.resolve(Array.from(this.host().connections()).length);
  }

  public async connect(kind: ConformanceGrant = "valid"): Promise<ConformanceUpgrade> {
    const url = new URL("/_cable/ws", this.baseUrl);
    url.protocol = "ws:";
    url.searchParams.set("ch", this.key);
    url.searchParams.set(
      "params",
      JSON.stringify({ roomId: kind === "wrong-host" ? "other" : this.roomId() }),
    );
    const grant = await this.grant(kind);
    const socket = new WebSocket(url, {
      headers: { "x-cable-grant": `${grant.payload}.${grant.sig}` },
    });
    const outcome = await new Promise<ConformanceUpgrade>((resolve, reject) => {
      socket.once("open", () =>
        resolve({ accepted: true, socket: new NodeConformanceSocket(socket) }),
      );
      socket.once("unexpected-response", (_request, response) => {
        response.resume();
        resolve({ accepted: false });
      });
      socket.once("error", (error) =>
        reject(
          error instanceof Error ? error : new Error(`Node WebSocket error: ${String(error)}`),
        ),
      );
    });
    return outcome;
  }

  /* oxlint-disable typescript/no-unsafe-type-assertion */
  public peerCall<T>(message: PeerMessage): Promise<T> {
    // SAFETY: Shared conformance selects T for the operation-specific peer response parsed by core.
    return this.runtime.peer(this.key, message) as Promise<T>;
  }
  /* oxlint-enable typescript/no-unsafe-type-assertion */

  public storageGet<T>(key: string): Promise<T | undefined> {
    return this.host().storage.get(key);
  }

  public storageList<T>(options: StorageListOptions): Promise<ReadonlyMap<string, T>> {
    return this.host().storage.list(options);
  }

  private host() {
    const host = this.runtime.host(this.key);
    if (host === undefined) throw new Error("Node runtime did not create the requested Host.");
    return host;
  }

  private roomId(): string {
    const match = this.key.match(/^conformance:(.+)$/u);
    if (match?.[1] === undefined) throw new Error("Unexpected conformance host key.");
    return match[1];
  }

  private async grant(kind: ConformanceGrant): Promise<SignedGrant> {
    const key =
      kind === "wrong-host" ? channelKey(conformanceChannel, { roomId: "other" }) : this.key;
    const signed = await signGrant(
      {
        exp: kind === "expired" ? Date.now() - 1 : Date.now() + 60_000,
        grants: ["connect"],
        hostKey: key,
        identity: { userId: kind === "valid-other" ? "other-user" : "socket-user" },
        params: { roomId: this.roomId() },
        uid: kind === "valid-other" ? "other-user" : "socket-user",
        v: 1,
      },
      grantSecret,
    );
    return kind === "invalid" ? { payload: signed.payload, sig: "invalid" } : signed;
  }
}

function grantFromRequest(request: IncomingMessage): SignedGrant | undefined {
  const value = request.headers["x-cable-grant"];
  if (value === undefined || Array.isArray(value)) return undefined;
  const separator = value.lastIndexOf(".");
  if (separator < 1 || separator === value.length - 1) return undefined;
  return { payload: value.slice(0, separator), sig: value.slice(separator + 1) };
}

async function nodeDriver(): Promise<HostConformanceDriver> {
  const server = await NodeConformanceServer.create();
  activeServers.add(server);
  return server;
}

afterEach(async () => {
  try {
    await Promise.all(Array.from(activeServers, async (server) => server.close()));
  } catch (error) {
    throw new Error(`Node conformance cleanup failed: ${String(error)}`, { cause: error });
  }
  activeServers.clear();
});

ordinaryHostConformance(nodeDriver);

describe("Node native upgrade failures", () => {
  it("reclaims a reservation after a malformed native WebSocket handshake fails before attachment", async () => {
    const driver = await NodeConformanceServer.create();
    activeServers.add(driver);
    await driver.failNativeAcceptance();
    await driver.waitForReservedGrant();
    await expect(driver.connectionCount()).resolves.toBe(0);
    await new Promise((resolve) => setTimeout(resolve, CONFORMANCE_POLICY.handshakeTimeoutMs + 25));
    await expect(driver.storageList({ prefix: "gr:" })).resolves.toEqual(new Map());
  });
});

describe("Node handler shutdown", () => {
  it("closes accepted WebSockets and releases the HTTP server", async () => {
    const driver = await NodeConformanceServer.create();
    activeServers.add(driver);
    const upgrade = await driver.connect();
    if (!upgrade.accepted) throw new Error("Expected a native Node upgrade.");
    if (!(upgrade.socket instanceof NodeConformanceSocket))
      throw new Error("Expected the native Node conformance socket.");
    const closed = upgrade.socket.waitForClose();
    await driver.close();
    await closed;
    expect(await closed.then(() => true)).toBe(true);
  });
});
