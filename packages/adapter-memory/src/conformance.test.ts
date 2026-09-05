import {
  CONFORMANCE_LIMITS,
  CONFORMANCE_POLICY,
  conformanceChannel,
  createConformanceImplementation,
  hostConformance,
  type ConformanceGrant,
  type ConformanceSocket,
  type HostConformanceDriver,
} from "@cable/conformance";
import {
  channelKey,
  decodeHostFrame,
  encodeClientFrame,
  signGrant,
  type ClientFrame,
  type GrantClaims,
  type HostWireFrame,
  type SignedGrant,
} from "@cable/core";

import { ManualClock } from "./clock.js";
import { createMemoryHost, type MemoryHost } from "./host.js";
import type { MemorySocket } from "./socket.js";

const grantSecret = "memory-conformance-secret-material-32-bytes";

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

  async terminate(): Promise<void> {
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

async function memoryDriver(): Promise<HostConformanceDriver> {
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
    host,
    advanceTime: (milliseconds) => host.advanceTime(milliseconds),
    async connect(kind = "valid") {
      const socket = host.connect(
        new Request("https://memory.invalid/_cable/ws"),
        await grant(kind, clock),
      );
      const connection = new ConformanceMemorySocket(socket, host);
      await host.flush();
      return socket.readyState === 1 ? { accepted: true, socket: connection } : { accepted: false };
    },
    failSends(connection) {
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
  };
}

hostConformance(memoryDriver);
