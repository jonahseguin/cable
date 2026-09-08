import * as cloudflarePublic from "@cablejs/cloudflare";
/* oxlint-disable typescript/no-deprecated -- Workers Vitest 1.1.4 exposes the
test worker fetch binding as deprecated SELF; the integration test exercises the
public Worker boundary until the plugin provides its replacement. */
import { conformanceChannel, hostConformance } from "@cablejs/conformance";
import {
  channelKey,
  decodeHostFrame,
  encodeClientFrame,
  signGrant,
  type GrantClaims,
} from "@cablejs/core";
import { evictDurableObject, runInDurableObject, SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createWorkerdConformanceDriver } from "./driver.js";
import type { ConformanceHost } from "./worker.js";

const grantSecret = "cloudflare-conformance-secret-material-32-bytes";

function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    socket.addEventListener(
      "message",
      (event: MessageEvent) => {
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Workerd message data is narrowed before protocol decoding.
        if (typeof event.data !== "string") throw new TypeError("Expected a text WebSocket frame.");
        resolve(event.data);
      },
      { once: true },
    );
  });
}

async function openNativeSocket(
  roomId: string,
  hello = true,
): Promise<{ readonly socket: WebSocket; readonly stub: DurableObjectStub }> {
  const key = channelKey(conformanceChannel, { roomId });
  const claims = {
    exp: Date.now() + 60_000,
    grants: ["connect"],
    hostKey: key,
    identity: { userId: "socket-user" },
    params: { roomId },
    uid: "socket-user",
    v: 1,
  } satisfies GrantClaims;
  const grant = await signGrant(claims, grantSecret);
  const stub = env.CABLE_HOSTS.getByName(key);
  const response = await stub.fetch(
    new Request("https://conformance.invalid/_cable/ws", {
      headers: { upgrade: "websocket", "x-cable-grant": `${grant.payload}.${grant.sig}` },
    }),
  );
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (socket === null) throw new Error("Durable Object did not return a WebSocket.");
  socket.accept();
  if (hello) {
    const welcome = nextMessage(socket);
    socket.send(encodeClientFrame({ t: "hello", v: 1 }));
    const frame = decodeHostFrame(await welcome);
    if (frame === "pong" || frame.t !== "welcome") {
      throw new Error("Native Durable Object did not negotiate the Cable protocol.");
    }
  }
  return { socket, stub };
}

hostConformance(createWorkerdConformanceDriver);

describe("Cloudflare Durable Object conformance", () => {
  it("imports the built public Cloudflare entry in workerd", () => {
    expect(cloudflarePublic.cloudflareHost).toBeTypeOf("function");
    expect(cloudflarePublic.createHandler).toBeTypeOf("function");
  });

  it("allows a generated host subclass to use native Durable Object context", async () => {
    const roomId = `subclass-${String(Date.now())}`;
    const key = channelKey(conformanceChannel, { roomId });
    // SAFETY: The conformance Worker binds this generated class, whose custom RPC is defined on ConformanceHost.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Workerd's generated namespace omits test-only RPC declarations.
    const stub = env.CABLE_HOSTS.getByName(key) as DurableObjectStub &
      Pick<ConformanceHost, "__cable_test_subclass_context">;

    // oxlint-disable-next-line eslint/no-underscore-dangle -- This is the explicit test-only RPC on the conformance subclass.
    const probe = await stub.__cable_test_subclass_context();
    expect(probe.hasEnvBinding).toBe(true);
    expect(probe.objectName).toBeTypeOf("string");
    expect(probe.objectName.length).toBeGreaterThan(0);
  });

  it("routes public handler requests without waking rejected hosts", async () => {
    await resetEdgeState();
    const malformed = await SELF.fetch(
      new Request("https://conformance.invalid/_cable/ws?ch=conformance%3Aedge&params=%7B", {
        headers: { upgrade: "websocket" },
      }),
    );
    expect(malformed.status).toBe(400);
    await malformed.text();

    const unauthenticated = await SELF.fetch(
      new Request(
        "https://conformance.invalid/_cable/ws?ch=conformance%3Aedge&params=%7B%22roomId%22%3A%22edge%22%7D",
        { headers: { upgrade: "websocket" } },
      ),
    );
    expect(unauthenticated.status).toBe(401);
    await unauthenticated.text();
    await expect(edgeState()).resolves.toContain('"namedStubRequests":0');
  });

  it("routes authorized upgrades through the public handler with a private grant", async () => {
    await resetEdgeState();
    const response = await SELF.fetch(
      new Request(
        "https://conformance.invalid/_cable/ws?ch=conformance%3Aedge&params=%7B%22roomId%22%3A%22edge%22%7D&token=browser-token",
        {
          headers: {
            authorization: "Bearer edge-valid",
            cookie: "session=caller-cookie",
            upgrade: "websocket",
            "x-cable-caller": "untrusted",
          },
        },
      ),
    );
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    if (socket === null) throw new Error("Public handler did not return a WebSocket.");
    socket.accept();
    const welcome = nextMessage(socket);
    socket.send(encodeClientFrame({ t: "hello", v: 1 }));
    expect(decodeHostFrame(await welcome)).toMatchObject({ t: "welcome", v: 1 });

    const state = await edgeState();
    expect(state).toContain('"namedStubRequests":1');
    expect(state).toContain('"authorization":null');
    expect(state).toContain('"cookie":null');
    expect(state).toContain('"token":null');
    expect(state).not.toContain('"cableGrant":null');
  });

  it("runs global RPC and host fallback calls through the public handler", async () => {
    const rpc = await SELF.fetch(
      new Request("https://conformance.invalid/_cable/rpc", {
        body: JSON.stringify({ calls: [{ id: "probe", input: { value: "ok" }, path: "probe" }] }),
        headers: { authorization: "Bearer edge-valid", "content-type": "application/json" },
        method: "POST",
      }),
    );
    expect(rpc.status).toBe(200);
    await expect(rpc.text()).resolves.toContain("edge-user:ok");

    const typedError = await SELF.fetch(
      new Request("https://conformance.invalid/_cable/rpc", {
        body: JSON.stringify({ calls: [{ id: "deny", input: { value: "deny" }, path: "probe" }] }),
        headers: { authorization: "Bearer edge-valid", "content-type": "application/json" },
        method: "POST",
      }),
    );
    expect(typedError.status).toBe(200);
    await expect(typedError.text()).resolves.toContain('"code":"DENIED"');

    const fallback = await SELF.fetch(
      new Request("https://conformance.invalid/_cable/host/conformance%3Aedge-fallback/inspect", {
        body: JSON.stringify({ input: { value: "fallback" }, params: { roomId: "edge-fallback" } }),
        headers: { authorization: "Bearer edge-valid", "content-type": "application/json" },
        method: "POST",
      }),
    );
    expect(fallback.status).toBe(200);
    await expect(fallback.text()).resolves.toContain("out:FALLBACK");
  });

  it("pushes validated server events through the public host facade", async () => {
    const roomId = `server-push-${String(Date.now())}`;
    const { socket, stub } = await openNativeSocket(roomId);
    const eventMessage = nextMessage(socket);
    const pushed = await SELF.fetch(
      new Request("https://conformance.invalid/__cable_test/server-push", {
        body: JSON.stringify({ roomId, text: "from edge" }),
        method: "POST",
      }),
    );
    expect(pushed.status).toBe(200);
    await expect(pushed.json()).resolves.toEqual({ seq: 1 });
    expect(decodeHostFrame(await eventMessage)).toMatchObject({
      d: { source: "procedure", text: "from edge" },
      ev: "message",
      seq: 1,
      t: "ev",
    });
    await expect(
      runInDurableObject(stub, (_instance, state) => state.storage.get("meta:seq")),
    ).resolves.toBe(1);
  });

  it("rejects invalid server events and denies a configured server push grant", async () => {
    const invalidRoom = `server-push-invalid-${String(Date.now())}`;
    const invalid = await SELF.fetch(
      new Request("https://conformance.invalid/__cable_test/server-push", {
        body: JSON.stringify({ roomId: 42, text: "invalid" }),
        method: "POST",
      }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ code: "BAD_REQUEST" });
    await expect(
      runInDurableObject(
        env.CABLE_HOSTS.getByName(channelKey(conformanceChannel, { roomId: invalidRoom })),
        (_instance, state) => state.storage.get("meta:seq"),
      ),
    ).resolves.toBeUndefined();

    const denied = await SELF.fetch(
      new Request("https://conformance.invalid/__cable_test/server-push", {
        body: JSON.stringify({ roomId: "server-push-deny", text: "blocked" }),
        method: "POST",
      }),
    );
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ code: "FORBIDDEN" });
  });

  it("drives a real host through the test-only conformance driver after hibernation", async () => {
    const driver = await createWorkerdConformanceDriver("driver-smoke");
    expect(driver.capabilities.injectSendFailure).toBe(false);
    expect(driver.key).toBe(channelKey(conformanceChannel, { roomId: "driver-smoke" }));
    expect(driver.limits.maxFrameBytes).toBeGreaterThan(0);
    await expect(driver.connectionCount()).resolves.toBe(0);
    await expect(driver.storageGet("missing")).resolves.toBeUndefined();
    await expect(driver.storageList({ prefix: "ev:" })).resolves.toEqual(new Map());
    await expect(
      driver.peerCall({
        d: { value: "driver" },
        grants: ["connect"],
        identity: { userId: "peer-user" },
        p: "inspect",
        t: "call",
      }),
    ).resolves.toEqual({ d: { userId: "peer-user", value: "out:DRIVER", via: "peer" }, ok: true });

    const upgrade = await driver.connect();
    if (!upgrade.accepted) throw new Error("Conformance driver did not accept a valid grant.");
    await upgrade.socket.send({ t: "hello", v: 1 });
    await expect(upgrade.socket.next()).resolves.toMatchObject({ t: "welcome", v: 1 });
    await expect(driver.connectionCount()).resolves.toBe(1);
    await expect(driver.attachmentLimitProbe()).rejects.toThrow(/attachment|byte|limit|size/iu);

    await driver.hibernate?.();
    await upgrade.socket.send({ d: { text: "after driver wake" }, ev: "publish", t: "emit" });
    await expect(upgrade.socket.next()).resolves.toMatchObject({
      d: { source: "client", text: "after driver wake" },
      seq: 1,
      t: "ev",
    });
    await expect(driver.storageGet("meta:seq")).resolves.toBe(1);
  });

  it("delivers a native hello deadline after ping and hibernation", async () => {
    const { socket, stub } = await openNativeSocket("native-hello-deadline", false);
    const pong = nextMessage(socket);
    socket.send(encodeClientFrame("ping"));
    await expect(pong).resolves.toBe("pong");
    await evictDurableObject(stub, { webSockets: "hibernate" });
    expect(decodeHostFrame(await nextMessage(socket))).toMatchObject({ t: "bye" });
    await expect(
      runInDurableObject(stub, async (_instance, state) => state.storage.list({ prefix: "gr:" })),
    ).resolves.toEqual(new Map());
  });

  it("delivers native timers in deadline order across hibernation", async () => {
    const { socket, stub } = await openNativeSocket("native-timer-order");
    const now = Date.now();
    socket.send(
      encodeClientFrame({ d: { at: now + 40, text: "later" }, ev: "schedule", t: "emit" }),
    );
    socket.send(
      encodeClientFrame({ d: { at: now + 20, text: "earlier" }, ev: "schedule", t: "emit" }),
    );
    await expect(
      runInDurableObject(stub, (_instance, state) => state.storage.getAlarm()),
    ).resolves.not.toBeNull();
    await evictDurableObject(stub, { webSockets: "hibernate" });
    expect(decodeHostFrame(await nextMessage(socket))).toMatchObject({
      d: { source: "timer", text: "earlier" },
      seq: 1,
      t: "ev",
    });
    expect(decodeHostFrame(await nextMessage(socket))).toMatchObject({
      d: { source: "timer", text: "later" },
      seq: 2,
      t: "ev",
    });
  });

  it("compacts retained history after a native timer crosses its retention deadline", async () => {
    const { socket, stub } = await openNativeSocket("native-history-retention");
    const published = nextMessage(socket);
    socket.send(encodeClientFrame({ d: { text: "expired" }, ev: "publish", t: "emit" }));
    expect(decodeHostFrame(await published)).toMatchObject({ seq: 1, t: "ev" });
    socket.send(
      encodeClientFrame({
        d: { at: Date.now() + 1_050, text: "retention-barrier" },
        ev: "schedule",
        t: "emit",
      }),
    );
    await expect(
      runInDurableObject(stub, (_instance, state) => state.storage.getAlarm()),
    ).resolves.not.toBeNull();
    await evictDurableObject(stub, { webSockets: "hibernate" });
    expect(decodeHostFrame(await nextMessage(socket))).toMatchObject({
      d: { source: "timer", text: "retention-barrier" },
      seq: 2,
      t: "ev",
    });
    const stale = await openNativeSocket("native-history-retention", false);
    const reset = nextMessage(stale.socket);
    stale.socket.send(encodeClientFrame({ since: 0, t: "hello", v: 1 }));
    expect(decodeHostFrame(await reset)).toMatchObject({ reset: true, replay: [], t: "welcome" });
  });

  it("retries a native timer once after hibernation without a duplicate durable record", async () => {
    const { socket, stub } = await openNativeSocket("native-timer-retry");
    socket.send(
      encodeClientFrame({ d: { at: Date.now() + 20, text: "retry" }, ev: "schedule", t: "emit" }),
    );
    await expect(
      runInDurableObject(stub, (_instance, state) => state.storage.getAlarm()),
    ).resolves.not.toBeNull();
    await evictDurableObject(stub, { webSockets: "hibernate" });
    expect(decodeHostFrame(await nextMessage(socket))).toMatchObject({
      d: { source: "timer", text: "retry" },
      seq: 1,
      t: "ev",
    });
    const timers = await runInDurableObject(stub, (_instance, state) =>
      state.storage.list({ prefix: "tm:" }),
    );
    expect([...timers.keys()].filter((key) => key.includes(":user:"))).toEqual([]);
  });

  it("keeps an accepted socket and durable sequence through hibernation eviction", async () => {
    const key = channelKey(conformanceChannel, { roomId: "room" });
    const claims = {
      exp: Date.now() + 60_000,
      grants: ["connect"],
      hostKey: key,
      identity: { userId: "socket-user" },
      params: { roomId: "room" },
      uid: "socket-user",
      v: 1,
    } satisfies GrantClaims;
    const grant = await signGrant(claims, grantSecret);
    const stub = env.CABLE_HOSTS.getByName(key);
    const response = await stub.fetch(
      new Request("https://conformance.invalid/_cable/ws", {
        headers: {
          upgrade: "websocket",
          "x-cable-grant": `${grant.payload}.${grant.sig}`,
        },
      }),
    );
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    if (socket === null) throw new Error("Durable Object did not return a WebSocket.");
    socket.accept();

    const welcomeMessage = nextMessage(socket);
    socket.send(encodeClientFrame({ t: "hello", v: 1 }));
    expect(decodeHostFrame(await welcomeMessage)).toMatchObject({ t: "welcome", v: 1 });

    await evictDurableObject(stub, { webSockets: "hibernate" });
    await expect(
      runInDurableObject(stub, (_instance, state) => state.getWebSockets().length),
    ).resolves.toBe(1);

    const eventMessage = nextMessage(socket);
    socket.send(encodeClientFrame({ d: { text: "after wake" }, ev: "publish", t: "emit" }));
    expect(decodeHostFrame(await eventMessage)).toMatchObject({
      d: { source: "client", text: "after wake" },
      seq: 1,
      t: "ev",
    });
  });

  it("does not retain an unaccepted socket after a rejected private grant", async () => {
    const key = channelKey(conformanceChannel, { roomId: "rejected-grant" });
    const claims = {
      exp: Date.now() + 60_000,
      grants: ["connect"],
      hostKey: key,
      identity: { userId: "rejected-user" },
      params: { roomId: "rejected-grant" },
      uid: "rejected-user",
      v: 1,
    } satisfies GrantClaims;
    const grant = await signGrant(claims, grantSecret);
    const stub = env.CABLE_HOSTS.getByName(key);
    const response = await stub.fetch(
      new Request("https://conformance.invalid/_cable/ws", {
        headers: {
          upgrade: "websocket",
          "x-cable-grant": `${grant.payload}.invalid`,
        },
      }),
    );
    expect(response.status).toBe(401);
    await response.text();
    await expect(
      runInDurableObject(stub, (_instance, state) => state.getWebSockets().length),
    ).resolves.toBe(0);
  });
});

async function edgeState(): Promise<string> {
  const response = await SELF.fetch("https://conformance.invalid/__cable_test/edge-state");
  expect(response.status).toBe(200);
  return response.text();
}

async function resetEdgeState(): Promise<void> {
  const response = await SELF.fetch(
    new Request("https://conformance.invalid/__cable_test/reset-edge-state", { method: "POST" }),
  );
  expect(response.status).toBe(204);
}
