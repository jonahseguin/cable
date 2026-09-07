import {
  CONFORMANCE_LIMITS,
  CONFORMANCE_POLICY,
  conformanceChannel,
  createConformanceImplementation,
  hostConformance,
  temporalHostConformance,
  type ConformanceGrant,
  type ConformanceSocket,
  type TemporalHostConformanceDriver,
} from "@cablejs/conformance";
import {
  channelKey,
  decodeHostFrame,
  encodeClientFrame,
  signGrant,
  type ClientFrame,
  type GrantClaims,
  type GrantId,
  type HostWireFrame,
  type SignedGrant,
} from "@cablejs/core";
import { describe, expect, it } from "vitest";

import { ManualClock } from "./clock.js";
import { createMemoryHost, type MemoryHost } from "./host.js";
import type { MemorySocket } from "./socket.js";

const grantSecret = "memory-conformance-secret-material-32-bytes";

interface MemoryConformanceRuntime {
  readonly clock: ManualClock;
  readonly connect: (kind?: ConformanceGrant) => Promise<ConformanceMemorySocket>;
  readonly host: MemoryHost;
}

class ConformanceMemorySocket implements ConformanceSocket {
  private readonly frames: HostWireFrame[] = [];
  private readonly host: MemoryHost;
  private readonly socket: MemorySocket;
  private readonly waiters: ((frame: HostWireFrame) => void)[] = [];

  constructor(socket: MemorySocket, host: MemoryHost) {
    this.socket = socket;
    this.host = host;
    socket.addEventListener("message", (event: MessageEvent<string>) => {
      const frame = decodeHostFrame(event.data);
      const waiter = this.waiters.shift();
      if (waiter === undefined) this.frames.push(frame);
      else waiter(frame);
    });
  }

  async close(code?: number, reason?: string): Promise<void> {
    this.socket.close(code, reason);
    await this.host.flush();
  }

  next(): Promise<HostWireFrame> {
    const frame = this.frames.shift();
    if (frame !== undefined) return Promise.resolve(frame);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async send(frame: ClientFrame | string | ArrayBuffer): Promise<void> {
    const encoded =
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The conformance driver accepts a closed raw-string, binary, or parsed-frame union and validates parsed frames with the protocol codec.
      typeof frame === "object" && !(frame instanceof ArrayBuffer)
        ? encodeClientFrame(frame)
        : frame;
    this.socket.send(encoded);
    await this.host.flush();
  }

  async lose(): Promise<void> {
    this.socket.terminate();
    await this.host.flush();
  }
}

async function grant(kind: ConformanceGrant, clock: ManualClock): Promise<SignedGrant> {
  const key = channelKey(conformanceChannel, {
    roomId: kind === "wrong-host" ? "other" : "room",
  });
  const claims = {
    exp: kind === "expired" ? clock.now() - 1 : clock.now() + 60_000,
    grants: ["connect"],
    hostKey: key,
    identity: { userId: kind === "valid-other" ? "other-user" : "socket-user" },
    params: { roomId: kind === "wrong-host" ? "other" : "room" },
    uid: kind === "valid-other" ? "other-user" : "socket-user",
    v: 1,
  } satisfies GrantClaims;
  const signed = await signGrant(claims, grantSecret);
  return kind === "invalid" ? { payload: signed.payload, sig: "invalid" } : signed;
}

function createMemoryConformanceRuntime(): MemoryConformanceRuntime {
  const clock = new ManualClock(1_000);
  let nextId = 0;
  const host = createMemoryHost(conformanceChannel, createConformanceImplementation(), {
    clock,
    grantSecret,
    handshakeTimeoutMs: CONFORMANCE_POLICY.handshakeTimeoutMs,
    key: channelKey(conformanceChannel, { roomId: "room" }),
    limits: CONFORMANCE_LIMITS,
    presenceSweepMs: 60_000,
    randomId: () => `${"\0".repeat(119)}${String(++nextId).padStart(8, "0")}`,
    replayChunkBytes: CONFORMANCE_POLICY.replayChunkBytes,
    timerRetryMs: CONFORMANCE_POLICY.timerRetryMs,
  });
  return {
    clock,
    async connect(kind = "valid") {
      const socket = host.connect(
        new Request("https://memory.invalid/_cable/ws"),
        await grant(kind, clock),
      );
      const connection = new ConformanceMemorySocket(socket, host);
      await host.flush();
      if (socket.readyState !== 1) throw new Error("Conformance upgrade was rejected.");
      return connection;
    },
    host,
  };
}

async function memoryDriver(): Promise<TemporalHostConformanceDriver> {
  const { clock, connect, host } = createMemoryConformanceRuntime();
  return {
    capabilities: { injectSendFailure: true },
    key: host.key,
    limits: host.limits,
    async attachmentLimitProbe() {
      const connection = Array.from(host.connections())[0];
      if (connection === undefined)
        throw new Error("Accepted socket is absent from Host.connections().");
      const attachment = connection.attachment.get();
      if (attachment === undefined) throw new Error("Accepted socket has no attachment.");
      // SAFETY: This intentionally oversized brand tests the adapter attachment boundary.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GrantId is a string brand.
      const grantId = "g".repeat(host.limits.attachmentBytes + 1) as GrantId;
      connection.attachment.set({ ...attachment, grantId });
    },
    advanceTime: (milliseconds) => host.advanceTime(milliseconds),
    connectionCount: async () => Array.from(host.connections()).length,
    async connect(kind = "valid") {
      if (kind !== "valid") {
        const socket = host.connect(
          new Request("https://memory.invalid/_cable/ws"),
          await grant(kind, clock),
        );
        await host.flush();
        return socket.readyState === 1
          ? { accepted: true, socket: new ConformanceMemorySocket(socket, host) }
          : { accepted: false };
      }
      return { accepted: true, socket: await connect() };
    },
    async failOneSend() {
      const connection = Array.from(host.connections())[0];
      if (connection === undefined) throw new Error("Expected a connection to inject failure.");
      const descriptor = Object.getOwnPropertyDescriptor(connection, "send");
      Object.defineProperty(connection, "send", {
        configurable: true,
        value() {
          throw new Error("Injected memory socket send failure.");
        },
      });
      return () => {
        if (descriptor === undefined) Reflect.deleteProperty(connection, "send");
        else Object.defineProperty(connection, "send", descriptor);
      };
    },
    hibernate: () => host.hibernate(),
    now: async () => host.now(),
    peerCall: (message) => host.peers.call(host.key, message),
    scheduleGet: () => host.schedule.get(),
    storageGet: (key) => host.storage.get(key),
    storageList: (options) => host.storage.list(options),
  };
}

hostConformance(memoryDriver);
temporalHostConformance(memoryDriver);

describe.each([false, true])("MemoryHost lost socket presence", (hibernate) => {
  it("sweeps presence only after the runtime loses the socket", async () => {
    const { connect, host } = createMemoryConformanceRuntime();
    const observer = await connect();
    await observer.send({ t: "hello", v: 1 });
    await observer.next();
    const lost = await connect();
    await lost.send({ t: "hello", v: 1 });
    await lost.next();
    await lost.send({ d: { name: "Grace", online: true }, t: "presence" });
    const joined = await observer.next();
    expect(joined).toMatchObject({ join: [{ d: { name: "Grace", online: true } }], t: "presence" });

    await lost.lose();
    const retainedPresence = await host.storage.list({ prefix: "pr:" });
    expect(retainedPresence.size).toBe(1);
    if (hibernate) await host.hibernate();
    await host.advanceTime(60_001);

    const swept = await observer.next();
    expect(swept).toMatchObject({ leave: [expect.any(String)], t: "presence" });
    await expect(host.storage.list({ prefix: "pr:" })).resolves.toEqual(new Map());
  });
});
