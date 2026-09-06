import * as cloudflarePublic from "@cable/cloudflare";
/* oxlint-disable typescript/no-deprecated -- Workers Vitest 1.1.4 exposes the
test worker fetch binding as deprecated SELF; the integration test exercises the
public Worker boundary until the plugin provides its replacement. */
import { conformanceChannel, hostConformance } from "@cable/conformance";
import {
  channelKey,
  decodeHostFrame,
  encodeClientFrame,
  signGrant,
  type GrantClaims,
} from "@cable/core";
import { evictDurableObject, runInDurableObject, SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createWorkerdConformanceDriver } from "./driver.js";

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

hostConformance(createWorkerdConformanceDriver);

describe("Cloudflare Durable Object conformance", () => {
  it("imports the built public Cloudflare entry in workerd", () => {
    expect(cloudflarePublic.cloudflareHost).toBeTypeOf("function");
    expect(cloudflarePublic.createHandler).toBeTypeOf("function");
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

  it("drives a real host through the test-only conformance driver after hibernation", async () => {
    const driver = await createWorkerdConformanceDriver("driver-smoke");
    expect(driver.capabilities.injectSendFailure).toBe(false);
    expect(driver.key).toBe(channelKey(conformanceChannel, { roomId: "driver-smoke" }));
    expect(driver.limits.maxFrameBytes).toBeGreaterThan(0);
    await expect(driver.connectionCount()).resolves.toBe(0);
    const initialTime = await driver.now();
    await driver.advanceTime(1);
    await expect(driver.now()).resolves.toBe(initialTime + 1);
    await expect(driver.scheduleGet()).resolves.toBeNull();
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
