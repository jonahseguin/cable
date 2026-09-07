/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-runtime-typeof,
eslint/no-underscore-dangle,
typescript/no-redundant-type-constituents, typescript/no-unsafe-argument,
typescript/no-unsafe-assignment, typescript/no-unsafe-call,
typescript/no-unsafe-member-access -- This test-only
workerd driver calls generated Durable Object RPC bindings. The root lint project
cannot load cloudflare:test globals; workerd/tsconfig.json typechecks this file
with the official plugin declarations. */
import { conformanceChannel } from "@cablejs/conformance";
import type {
  ConformanceGrant,
  ConformanceSocket,
  ConformanceUpgrade,
  HostConformanceDriver,
} from "@cablejs/conformance";
import {
  channelKey,
  decodeHostFrame,
  encodeClientFrame,
  signGrant,
  type ClientFrame,
  type HostKey,
  type HostLimits,
  type HostWireFrame,
  type PeerMessage,
  type StorageListOptions,
} from "@cablejs/core";
import { evictDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";

import type {
  ConformanceHost,
  ConformanceStorageEntry,
  ConformanceStorageValue,
} from "./worker.js";

const grantSecret = "cloudflare-conformance-secret-material-32-bytes";
const socketUser = { userId: "socket-user" };
let nextDriverRoom = 0;

type ConformanceControlStub = DurableObjectStub &
  Pick<
    ConformanceHost,
    | "__cable_test_attachment_limit_probe"
    | "__cable_test_connection_count"
    | "__cable_test_key"
    | "__cable_test_limits"
    | "__cable_test_peer_call"
    | "__cable_test_peer_send"
    | "__cable_test_storage_get"
    | "__cable_test_storage_list"
  >;

/** Create one isolated real-workerd conformance driver. */
export async function createWorkerdConformanceDriver(
  roomId = `workerd-${String(++nextDriverRoom)}`,
): Promise<HostConformanceDriver> {
  const key = channelKey(conformanceChannel, { roomId });
  // SAFETY: The generated binding and ConformanceHost share this test-only
  // Durable Object class; the generated binding cannot express its RPC methods.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Workerd's generated namespace omits test-only RPC method declarations.
  const stub = env.CABLE_HOSTS.getByName(key) as unknown as ConformanceControlStub;
  const [hostKey, limits] = await Promise.all([
    stub.__cable_test_key(),
    stub.__cable_test_limits(),
  ]);
  return new WorkerdHostConformanceDriver(key, roomId, hostKey, limits, stub);
}

class WorkerdHostConformanceDriver implements HostConformanceDriver {
  public readonly capabilities = Object.freeze({ injectSendFailure: false });
  public readonly key: string;
  public readonly limits: HostLimits;
  private readonly hostKey: HostKey;
  private readonly roomId: string;
  private readonly stub: ConformanceControlStub;

  public constructor(
    key: HostKey,
    roomId: string,
    hostKey: string,
    limits: HostLimits,
    stub: ConformanceControlStub,
  ) {
    if (key !== hostKey)
      throw new Error("Conformance Durable Object returned an unexpected host key.");
    this.hostKey = key;
    this.roomId = roomId;
    this.key = hostKey;
    this.limits = limits;
    this.stub = stub;
  }

  public async attachmentLimitProbe(): Promise<void> {
    const failure = await this.stub.__cable_test_attachment_limit_probe();
    if (failure === null) throw new Error("Attachment limit probe unexpectedly succeeded.");
    throw new RangeError(failure);
  }

  public connectionCount(): Promise<number> {
    return Promise.resolve(this.stub.__cable_test_connection_count());
  }

  public async connect(grant: ConformanceGrant = "valid"): Promise<ConformanceUpgrade> {
    const now = Date.now();
    const claims = {
      exp: grant === "expired" ? now - 1 : now + 60_000,
      grants: ["connect"],
      hostKey:
        grant === "wrong-host" ? channelKey(conformanceChannel, { roomId: "wrong" }) : this.hostKey,
      identity: grant === "valid-other" ? { userId: "other-user" } : socketUser,
      params: { roomId: this.roomId },
      uid: grant === "valid-other" ? "other-user" : "socket-user",
      v: 1,
    } as const;
    const signed = await signGrant(claims, grantSecret);
    const header =
      grant === "invalid" ? `${signed.payload}.invalid` : `${signed.payload}.${signed.sig}`;
    const response = await this.stub.fetch(
      new Request("https://conformance.invalid/_cable/ws", {
        headers: { upgrade: "websocket", "x-cable-grant": header },
      }),
    );
    if (response.status !== 101 || response.webSocket === null) {
      await response.text();
      return { accepted: false };
    }
    response.webSocket.accept();
    return {
      accepted: true,
      socket: new WorkerdConformanceSocket(response.webSocket, async () => {
        await this.stub.__cable_test_connection_count();
      }),
    };
  }

  public async hibernate(): Promise<void> {
    // Test RPC activates an object that workerd may have already put to sleep
    // after the preceding WebSocket callback. The eviction API only accepts a
    // currently running object.
    await this.stub.__cable_test_connection_count();
    await evictDurableObject(this.stub, { webSockets: "hibernate" });
  }

  public async peerCall<T>(message: PeerMessage): Promise<T> {
    const result = await this.stub.__cable_test_peer_call(message);
    // SAFETY: The shared scenario supplies the operation's expected peer result type.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Peer RPC parsing belongs to the core operation boundary.
    return result as T;
  }

  public async storageGet<T>(key: string): Promise<T | undefined> {
    const result: ConformanceStorageValue = await this.stub.__cable_test_storage_get(key);
    if (!result.found) return undefined;
    // SAFETY: The shared scenario writes each observed storage value through the same typed core engine.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Durable storage is a structured-clone boundary.
    return result.value as T;
  }

  public async storageList<T>(options: StorageListOptions): Promise<ReadonlyMap<string, T>> {
    const entries: readonly ConformanceStorageEntry[] =
      await this.stub.__cable_test_storage_list(options);
    // SAFETY: The shared scenario writes each observed storage value through the same typed core engine.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Durable storage is a structured-clone boundary.
    return new Map(entries as readonly (readonly [string, T])[]);
  }
}

class WorkerdConformanceSocket implements ConformanceSocket {
  private readonly drain: () => Promise<void>;
  private readonly frames: HostWireFrame[] = [];
  private readonly waiting: Array<(frame: HostWireFrame) => void> = [];
  private readonly socket: WebSocket;

  public constructor(socket: WebSocket, drain: () => Promise<void>) {
    this.drain = drain;
    this.socket = socket;
    socket.addEventListener("message", (event: MessageEvent) => {
      if (typeof event.data !== "string") throw new TypeError("Expected a text WebSocket frame.");
      this.push(decodeHostFrame(event.data));
    });
  }

  public async close(code?: number, reason?: string): Promise<void> {
    this.socket.close(code, reason);
    await this.drain();
  }

  public next(): Promise<HostWireFrame> {
    const frame = this.frames.shift();
    return frame === undefined
      ? new Promise((resolve) => {
          this.waiting.push(resolve);
        })
      : Promise.resolve(frame);
  }

  public async send(frame: ClientFrame | string | ArrayBuffer): Promise<void> {
    this.socket.send(
      typeof frame === "string" || frame instanceof ArrayBuffer ? frame : encodeClientFrame(frame),
    );
    await Promise.resolve();
  }

  private push(frame: HostWireFrame): void {
    const resolve = this.waiting.shift();
    if (resolve === undefined) this.frames.push(frame);
    else resolve(frame);
  }
}
