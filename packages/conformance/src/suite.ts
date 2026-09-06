import {
  decodeHostFrame,
  encodeClientFrame,
  type GrantId,
  type HostFrame,
  type PeerMessage,
} from "@cable/core";
import { describe, expect, it } from "vitest";

import type {
  ConformanceSocket,
  ConformanceUpgrade,
  HostConformanceDriver,
  HostConformanceFactory,
} from "./driver.js";
import { CONFORMANCE_POLICY } from "./fixture.js";

type ScenarioMode = "hibernate" | "ordinary";
type ScenarioStep = <Result>(operation: () => Promise<Result>) => Promise<Result>;

function accepted(upgrade: ConformanceUpgrade): ConformanceSocket {
  if (!upgrade.accepted) throw new Error("Expected the conformance upgrade to be accepted.");
  return upgrade.socket;
}

async function nextFrame(socket: ConformanceSocket): Promise<HostFrame> {
  const frame = await socket.next();
  if (frame === "pong") throw new Error("Expected a structured Host frame.");
  return frame;
}

function frameHasType<Type extends HostFrame["t"]>(
  frame: HostFrame,
  type: Type,
): frame is Extract<HostFrame, { readonly t: Type }> {
  return frame.t === type;
}

async function nextOfType<Type extends HostFrame["t"]>(
  socket: ConformanceSocket,
  type: Type,
): Promise<Extract<HostFrame, { readonly t: Type }>> {
  for (let count = 0; count < 20; count += 1) {
    // Frames are ordered by the Host; unrelated broadcasts are consumed while
    // the scenario waits for its request-correlated result.
    // eslint-disable-next-line no-await-in-loop
    const frame = await nextFrame(socket);
    if (frameHasType(frame, type)) return frame;
  }
  throw new Error(`Did not receive Host frame '${type}'.`);
}

async function openSocket(driver: HostConformanceDriver): Promise<ConformanceSocket> {
  const socket = accepted(await driver.connect());
  await socket.send({ t: "hello", v: 1 });
  const welcome = await nextOfType(socket, "welcome");
  expect(welcome.v).toBe(1);
  return socket;
}

async function welcomeSequence(
  socket: ConformanceSocket,
  step: ScenarioStep,
): Promise<readonly Extract<HostFrame, { readonly t: "welcome" }>[]> {
  const chunks: Extract<HostFrame, { readonly t: "welcome" }>[] = [];
  let more = true;
  while (more) {
    // Each welcome chunk is an independent adapter step; a hibernating driver
    // must retain the socket's resuming attachment until the terminal chunk.
    // eslint-disable-next-line no-await-in-loop
    const chunk = await step(() => nextOfType(socket, "welcome"));
    chunks.push(chunk);
    more = chunk.more === true;
  }
  return chunks;
}

async function publishRetainedEvents(
  driver: HostConformanceDriver,
  step: ScenarioStep,
  texts: readonly string[],
): Promise<void> {
  const socket = await step(() => openSocket(driver));
  for (const text of texts) {
    // Each emit is a separate protocol step so the hibernation mode rebuilds
    // between every durable append.
    // eslint-disable-next-line no-await-in-loop
    await step(() => socket.send({ d: { text }, ev: "publish", t: "emit" }));
    // eslint-disable-next-line no-await-in-loop
    await step(() => nextOfType(socket, "ev"));
  }
  await step(() => socket.terminate());
}

function peerCall(value: string): PeerMessage {
  return {
    d: { value },
    grants: ["connect"],
    identity: { userId: "peer-user" },
    p: "inspect",
    t: "call",
  };
}

function oversizedGrantId(bytes: number): GrantId {
  const value = "g".repeat(bytes);
  // SAFETY: This intentionally oversized opaque identifier exercises the
  // adapter's attachment boundary before the engine can persist it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GrantId has no runtime representation beyond string.
  return value as GrantId;
}

function scenarios(factory: HostConformanceFactory, mode: ScenarioMode): void {
  async function setup(): Promise<{
    readonly driver: HostConformanceDriver;
    readonly step: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  }> {
    const driver = await factory();
    let completed = 0;
    return {
      driver,
      async step<Result>(operation: () => Promise<Result>): Promise<Result> {
        if (mode === "hibernate" && completed > 0) {
          if (driver.hibernate === undefined) {
            throw new Error("The hibernation conformance mode requires driver.hibernate().");
          }
          await driver.hibernate();
        }
        const result = await operation();
        completed += 1;
        return result;
      },
    };
  }

  it("accepts only valid, unexpired grants for this Host", async () => {
    const { driver, step } = await setup();
    await expect(step(() => driver.connect("valid"))).resolves.toMatchObject({
      accepted: true,
    });
    await expect(step(() => driver.connect("invalid"))).resolves.toEqual({
      accepted: false,
    });
    await expect(step(() => driver.connect("expired"))).resolves.toEqual({
      accepted: false,
    });
    await expect(step(() => driver.connect("wrong-host"))).resolves.toEqual({
      accepted: false,
    });
  });

  it("retains and fires a pending hello deadline across reconstruction", async () => {
    const { driver, step } = await setup();
    const socket = accepted(await step(() => driver.connect()));
    await driver.hibernate?.();
    await step(() => driver.advanceTime(CONFORMANCE_POLICY.handshakeTimeoutMs + 1));
    const bye = await step(() => nextOfType(socket, "bye"));
    expect(bye.reason).toMatch(/handshake|hello/iu);
    expect(Array.from(driver.host.connections())).toEqual([]);
    await expect(driver.host.storage.list({ prefix: "gr:" })).resolves.toEqual(new Map());
  });

  it("negotiates hello and keeps event sequences monotonic", async () => {
    const { driver, step } = await setup();
    const socket = await step(() => openSocket(driver));
    await step(() => socket.send({ d: { text: "one" }, ev: "publish", id: "one", t: "emit" }));
    const first = await step(() => nextOfType(socket, "ev"));
    await step(() => socket.send({ d: { text: "two" }, ev: "publish", id: "two", t: "emit" }));
    const second = await step(() => nextOfType(socket, "ev"));
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
  });

  it("replays retained events and resets a stale cursor", async () => {
    const { driver, step } = await setup();
    await publishRetainedEvents(
      driver,
      step,
      Array.from({ length: 4 }, (_, index) => `event-${String(index + 1)}`),
    );

    const resumed = accepted(await step(() => driver.connect()));
    await step(() => resumed.send({ since: 2, t: "hello", v: 1 }));
    const replay = await welcomeSequence(resumed, step);
    expect(replay.flatMap((chunk) => chunk.replay).map((event) => event.seq)).toEqual([3, 4]);

    await step(() => driver.advanceTime(1_001));
    const stale = accepted(await step(() => driver.connect()));
    await step(() => stale.send({ since: 0, t: "hello", v: 1 }));
    const reset = await step(() => nextOfType(stale, "welcome"));
    expect(reset.reset).toBe(true);
    expect(reset.replay).toEqual([]);
  });

  it("returns validation and declared event errors without closing", async () => {
    const { driver, step } = await setup();
    const socket = await step(() => openSocket(driver));
    await step(() => socket.send({ d: { text: "" }, ev: "publish", id: "invalid", t: "emit" }));
    const invalid = await step(() => nextOfType(socket, "res"));
    expect(invalid).toMatchObject({
      id: "invalid",
      ok: false,
      e: { code: "VALIDATION" },
    });

    await step(() =>
      socket.send({
        d: { text: "reject" },
        ev: "publish",
        id: "rejected",
        t: "emit",
      }),
    );
    const rejected = await step(() => nextOfType(socket, "res"));
    expect(rejected).toMatchObject({
      id: "rejected",
      ok: false,
      e: { code: "REJECTED", data: { reason: "fixture rejection" } },
    });
  });

  it("applies channel input and output transforms once", async () => {
    const { driver, step } = await setup();
    const socket = await step(() => openSocket(driver));
    await step(() =>
      socket.send({ d: { text: "  trimmed  " }, ev: "publish", id: "transform", t: "emit" }),
    );
    const event = await step(() => nextOfType(socket, "ev"));
    expect(event.d).toEqual({ source: "client", text: "trimmed" });
    await step(() => nextOfType(socket, "res"));

    await step(() =>
      socket.send({ d: { value: "mixed" }, id: "procedure", p: "inspect", t: "call" }),
    );
    const result = await step(() => nextOfType(socket, "res"));
    expect(result).toMatchObject({
      d: { userId: "socket-user", value: "out:MIXED", via: "socket" },
      id: "procedure",
      ok: true,
    });
  });

  it("broadcasts presence updates, clean leaves, and stale sweeps", async () => {
    const { driver, step } = await setup();
    const first = await step(() => openSocket(driver));
    const second = await step(() => openSocket(driver));
    await step(() => first.send({ d: { name: "Ada", online: true }, t: "presence" }));
    const update = await step(() => nextOfType(second, "presence"));
    expect(update.join?.[0]?.d).toEqual({ name: "Ada", online: true });
    await step(() => first.close());
    const leave = await step(() => nextOfType(second, "presence"));
    expect(leave.leave).toHaveLength(1);

    const stale = await step(() => openSocket(driver));
    await step(() => stale.send({ d: { name: "Grace", online: true }, t: "presence" }));
    await step(() => nextOfType(second, "presence"));
    await step(() => stale.terminate());
    await step(() => driver.advanceTime(60_001));
    const swept = await step(() => nextOfType(second, "presence"));
    expect(swept.leave).toHaveLength(1);
  });

  it("re-arms one alarm for ordered durable timers", async () => {
    const { driver, step } = await setup();
    const socket = await step(() => openSocket(driver));
    const now = driver.host.now();
    await step(() =>
      socket.send({ d: { at: now + 20, text: "later" }, ev: "schedule", t: "emit" }),
    );
    await step(() =>
      socket.send({
        d: { at: now + 10, text: "earlier" },
        ev: "schedule",
        t: "emit",
      }),
    );
    await step(() => driver.advanceTime(10));
    const earlier = await step(() => nextOfType(socket, "ev"));
    expect(earlier.d).toEqual({ source: "timer", text: "earlier" });
    await step(() => driver.advanceTime(10));
    const later = await step(() => nextOfType(socket, "ev"));
    expect(later.d).toEqual({ source: "timer", text: "later" });
    const nextAlarm = await driver.host.schedule.get();
    expect(nextAlarm).not.toBeNull();
    expect(nextAlarm).toBeGreaterThan(driver.host.now());
  });

  it("retries a failed durable timer once without duplicate delivery", async () => {
    const { driver, step } = await setup();
    const socket = await step(() => openSocket(driver));
    const due = driver.host.now() + 10;
    await step(() => socket.send({ d: { at: due, text: "retry" }, ev: "schedule", t: "emit" }));
    await step(() => driver.advanceTime(10));
    await expect(driver.host.schedule.get()).resolves.toBe(due + CONFORMANCE_POLICY.timerRetryMs);
    await step(() => driver.advanceTime(CONFORMANCE_POLICY.timerRetryMs - 1));
    await expect(driver.host.schedule.get()).resolves.toBe(due + CONFORMANCE_POLICY.timerRetryMs);
    await step(() => driver.advanceTime(1));
    const event = await step(() => nextOfType(socket, "ev"));
    expect(event).toMatchObject({ d: { source: "timer", text: "retry" }, seq: 1 });
    await expect(driver.host.storage.get("meta:seq")).resolves.toBe(1);
  });

  it("runs one host procedure over a socket and peers", async () => {
    const { driver, step } = await setup();
    const socket = await step(() => openSocket(driver));
    await step(() =>
      socket.send({
        d: { value: "socket" },
        id: "call",
        p: "inspect",
        t: "call",
      }),
    );
    const result = await step(() => nextOfType(socket, "res"));
    expect(result).toMatchObject({
      d: { userId: "socket-user", value: "out:SOCKET", via: "socket" },
      id: "call",
      ok: true,
    });
    await expect(
      step(() => driver.host.peers.call(driver.host.key, peerCall("peer"))),
    ).resolves.toEqual({
      d: { userId: "peer-user", value: "out:PEER", via: "peer" },
      ok: true,
    });
  });

  it("pages history in ascending order and keeps logged targets private", async () => {
    const { driver, step } = await setup();
    const first = await step(() => openSocket(driver));
    const other = accepted(await step(() => driver.connect("valid-other")));
    await step(() => other.send({ t: "hello", v: 1 }));
    await step(() => nextOfType(other, "welcome"));

    await step(() =>
      first.send({
        d: { text: "private", uid: "socket-user" },
        id: "target",
        p: "target",
        t: "call",
      }),
    );
    const targeted = await step(() => nextOfType(first, "ev"));
    expect(targeted).toMatchObject({ d: { text: "private" }, seq: 1 });
    await step(() => nextOfType(first, "res"));

    for (let sequence = 2; sequence <= 4; sequence += 1) {
      // The hibernating matrix reconstructs the engine around every append and
      // every observation of the same persisted sequence.
      // eslint-disable-next-line no-await-in-loop
      await step(() =>
        first.send({
          d: { text: `public-${sequence}` },
          id: `announce-${sequence}`,
          p: "announce",
          t: "call",
        }),
      );
      // eslint-disable-next-line no-await-in-loop
      await step(() => nextOfType(first, "ev"));
      // eslint-disable-next-line no-await-in-loop
      await step(() => nextOfType(first, "res"));
      // If the targeted sequence leaked, this reads sequence 1 instead.
      // eslint-disable-next-line no-await-in-loop
      const visible = await step(() => nextOfType(other, "ev"));
      expect(visible.seq).toBe(sequence);
    }

    await step(() =>
      first.send({ d: { before: 5, limit: 2 }, id: "history", p: "history.load", t: "call" }),
    );
    const history = await step(() => nextOfType(first, "res"));
    expect(history).toMatchObject({
      d: { events: [{ seq: 3 }, { seq: 4 }], nextCursor: 3 },
      id: "history",
      ok: true,
    });
  });

  it("chunks replay and preserves terminal welcome ordering", async () => {
    const { driver, step } = await setup();
    // Long payloads force one retained event per welcome chunk under the
    // shared conformance replay limit.
    await publishRetainedEvents(
      driver,
      step,
      Array.from({ length: 3 }, (_, index) => `${String(index + 1)}:${"x".repeat(400)}`),
    );

    const resumed = accepted(await step(() => driver.connect()));
    await step(() => resumed.send({ since: 0, t: "hello", v: 1 }));
    const chunks = await welcomeSequence(resumed, step);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.slice(0, -1).every((chunk) => chunk.more === true)).toBe(true);
    expect(chunks.at(-1)?.more).toBeUndefined();
    expect(chunks.flatMap((chunk) => chunk.replay).map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  it("continues broadcast when one connection send throws", async () => {
    const { driver, step } = await setup();
    await step(() => openSocket(driver));
    const good = await step(() => openSocket(driver));
    const badConnection = Array.from(driver.host.connections())[0];
    if (badConnection === undefined) throw new Error("Expected a connection to inject failure.");
    const restore = driver.failSends(badConnection);
    try {
      await step(() => good.send({ d: { text: "survives" }, ev: "publish", t: "emit" }));
      const event = await step(() => nextOfType(good, "ev"));
      expect(event).toMatchObject({ d: { text: "survives" }, seq: 1 });
      await expect(driver.host.storage.get("meta:seq")).resolves.toBe(1);
      const events = await driver.host.storage.list({ prefix: "ev:" });
      expect(events.size).toBe(1);
    } finally {
      restore();
    }
  });

  it("does not persist oversized server events or presence", async () => {
    const { driver, step } = await setup();
    const socket = await step(() => openSocket(driver));
    await step(() => socket.send({ id: "oversized", p: "oversized", t: "call" }));
    const result = await step(() => nextOfType(socket, "res"));
    expect(result).toMatchObject({ id: "oversized", ok: false });
    await expect(driver.host.storage.get("meta:seq")).resolves.toBeUndefined();
    await expect(driver.host.storage.list({ prefix: "ev:" })).resolves.toEqual(new Map());

    await step(() => socket.send({ d: { name: "x".repeat(800), online: true }, t: "presence" }));
    await expect(driver.host.storage.list({ prefix: "pr:" })).resolves.toEqual(new Map());

    const next = accepted(await step(() => driver.connect()));
    await step(() => next.send({ t: "hello", v: 1 }));
    await expect(step(() => nextOfType(next, "welcome"))).resolves.toMatchObject({ seq: 0 });
  });

  it("enforces attachment and frame byte limits", async () => {
    const { driver, step } = await setup();
    const socket = await step(() => openSocket(driver));
    const connection = Array.from(driver.host.connections())[0];
    if (connection === undefined)
      throw new Error("Accepted socket is absent from Host.connections().");
    const attachment = connection.attachment.get();
    if (attachment === undefined) throw new Error("Accepted socket has no attachment.");
    expect(() => {
      connection.attachment.set({
        ...attachment,
        grantId: oversizedGrantId(driver.host.limits.attachmentBytes + 1),
      });
    }).toThrow(/attachment|byte|limit|size/iu);

    await step(() => socket.send("x".repeat(driver.host.limits.maxFrameBytes + 1)));
    const response = await step(() => nextFrame(socket));
    expect(["bye", "err"]).toContain(response.t);
  });

  it("keeps literal ping handling compatible with auto-response Hosts", async () => {
    const { driver, step } = await setup();
    const socket = accepted(await step(() => driver.connect()));
    await step(() => socket.send(encodeClientFrame("ping")));
    await expect(step(() => socket.next())).resolves.toBe("pong");
    expect(decodeHostFrame("pong")).toBe("pong");
    await step(() => driver.advanceTime(CONFORMANCE_POLICY.handshakeTimeoutMs + 1));
    const bye = await step(() => nextOfType(socket, "bye"));
    expect(bye.reason).toMatch(/handshake|hello/iu);
  });
}

/** Register the complete Host behavior matrix in ordinary and hibernating modes. */
export function hostConformance(factory: HostConformanceFactory): void {
  describe("Host conformance", () => {
    describe("ordinary", () => {
      scenarios(factory, "ordinary");
    });
    describe("hibernate between steps", () => {
      scenarios(factory, "hibernate");
    });
  });
}
