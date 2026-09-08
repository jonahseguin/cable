import { createMemoryHost } from "@cablejs/adapter-memory";
import type { MemoryHost, MemorySocket } from "@cablejs/adapter-memory";
import { c } from "@cablejs/contract";
import { CableError, resolveChannel, signGrant } from "@cablejs/core";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";

import { createClient } from "../src/index.js";
import type { ChannelHandle, Client } from "../src/index.js";

const room = c.channel("room.{id}", {
  params: z.object({ id: z.string().transform((id) => id.toLowerCase()) }),
  server: { message: z.string() },
  client: {
    publish: { input: z.string().trim(), errors: { MUTED: z.object({ until: z.number() }) } },
  },
  procedures: {
    length: c.query({
      input: z.string().transform((text) => text.length),
      output: z.number().transform(String),
    }),
  },
  presence: z.object({ name: z.string() }),
  history: { max: 20, retain: "1h" },
});
const api = c.contract({ room });
const secret = "client integration grant secret 123456789";
const disposals: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  vi.useRealTimers();
});

async function setup(hibernate: boolean) {
  vi.useFakeTimers();
  const resolved = await resolveChannel(room, { id: "ONE" });
  const host = createMemoryHost(
    room,
    {
      onClient: {
        async publish(context, text) {
          if (text === "muted") throw new CableError("MUTED", { data: { until: 42 } });
          await context.emit("message", text);
        },
      },
      procedures: { length: (_context, length) => length },
    },
    { key: resolved.key, grantSecret: secret },
  );
  const grant = await signGrant(
    {
      v: 1,
      hostKey: resolved.key,
      params: resolved.params,
      identity: null,
      grants: [],
      exp: host.now() + 60_000,
    },
    secret,
  );
  const sockets: MemorySocket[] = [];
  const urls: URL[] = [];
  function client() {
    return createClient({
      contract: api,
      url: "https://example.test/_cable",
      ws: {
        idleClose: 50,
        reconnect: { base: 10, jitter: false },
        createSocket(url) {
          urls.push(new URL(url));
          const socket = host.connect(new Request(url), grant);
          sockets.push(socket);
          return socket;
        },
      },
    });
  }
  function handle(owner: ReturnType<typeof client> = client(), id = "ONE") {
    const value = owner.room({ id });
    disposals.push(() => value.dispose());
    return value;
  }
  async function flush() {
    await vi.advanceTimersByTimeAsync(0);
    await host.flush();
    if (hibernate) await host.hibernate();
  }
  return { host, client, handle, sockets, urls, flush };
}

async function complete<Result>(promise: Promise<Result>, host: MemoryHost): Promise<Result> {
  const result = Promise.allSettled([promise]);
  await vi.advanceTimersByTimeAsync(0);
  await host.flush();
  const [settled] = await result;
  if (settled.status === "rejected") throw settled.reason;
  return settled.value;
}

describe.each([false, true])("channel client (hibernate: %s)", (hibernate) => {
  it("shares canonical keys and keeps other views alive through disposal", async () => {
    const fixture = await setup(hibernate);
    const owner = fixture.client();
    expect(owner.room === owner.room).toBe(true);
    const first = fixture.handle(owner);
    const second = fixture.handle(owner, "one");
    const received: string[] = [];
    first.on("message", () => undefined);
    second.on("message", (text) => received.push(text));
    await fixture.flush();
    expect(first.status).toBe("open");
    expect(fixture.sockets).toHaveLength(1);
    expect(fixture.urls[0]?.searchParams.get("params")).toBe('{"id":"ONE"}');
    first.dispose();
    await complete(second.publish("  hello  ", { ack: true }), fixture.host);
    expect(received).toEqual(["hello"]);
    expect(await complete(second.length("four"), fixture.host)).toBe("4");
    await fixture.flush();
    const page = await complete(second.history.load(), fixture.host);
    expect(page.events).toMatchObject([{ seq: 1, ev: "message", d: "hello" }]);
    second.dispose();
    await vi.advanceTimersByTimeAsync(49);
    expect([...fixture.host.connections()]).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await fixture.host.flush();
    expect([...fixture.host.connections()]).toHaveLength(0);
  });

  it("publishes presence and observes other connections joining and leaving", async () => {
    const fixture = await setup(hibernate);
    const first = fixture.handle();
    const second = fixture.handle();
    const observePresence = first.presence.on(() => undefined);
    first.presence.update({ name: "one" });
    second.presence.update({ name: "two" });
    await fixture.flush();
    expect(first.presence.self).toEqual({ name: "one" });
    expect(first.presence.others).toMatchObject([{ d: { name: "two" } }]);
    expect(second.presence.others).toMatchObject([{ d: { name: "one" } }]);
    second.dispose();
    await vi.advanceTimersByTimeAsync(50);
    await fixture.flush();
    expect(first.presence.others).toEqual([]);
    observePresence();
  });

  it("preserves declared acknowledgement errors and unsubscribes independently", async () => {
    const fixture = await setup(hibernate);
    const channel = fixture.handle();
    const received: string[] = [];
    const off = channel.on("message", (text) => received.push(text));
    await fixture.flush();
    const failure = complete(channel.publish("muted", { ack: true }), fixture.host);
    await expect(failure).rejects.toMatchObject({ code: "MUTED", data: { until: 42 } });
    off();
    off();
    await complete(channel.publish("after", { ack: true }), fixture.host);
    expect(received).toEqual([]);
    expect(channel.status).toBe("closed");
  });

  it("resumes missed events once and republishes presence after reconnect", async () => {
    const fixture = await setup(hibernate);
    const channel = fixture.handle();
    const received: string[] = [];
    const metadata: { text: string; seq: number | undefined; replayed: boolean }[] = [];
    channel.on("message", (text, event) => {
      received.push(text);
      metadata.push({ text, seq: event.seq, replayed: event.replayed });
    });
    channel.presence.update({ name: "returning" });
    await fixture.flush();
    await complete(channel.publish("before", { ack: true }), fixture.host);
    const socket = fixture.sockets[0];
    if (socket === undefined) throw new Error("Expected an open socket.");
    socket.terminate();
    await fixture.flush();
    await fixture.host.peers.send(fixture.host.key, { t: "emit", ev: "message", d: "missed" });
    await fixture.flush();
    await vi.advanceTimersByTimeAsync(10);
    await fixture.flush();
    expect(fixture.sockets).toHaveLength(2);
    expect(channel.status).toBe("open");
    expect(received).toEqual(["before", "missed"]);
    expect(metadata).toEqual([
      { text: "before", seq: 1, replayed: false },
      { text: "missed", seq: 2, replayed: true },
    ]);
    expect(channel.presence.self).toEqual({ name: "returning" });
  });

  it("is lazy and can dispose before asynchronous parameter validation completes", async () => {
    const fixture = await setup(hibernate);
    const channel = fixture.handle();
    expect(await Promise.resolve(channel)).toBe(channel);
    expect(channel.status).toBe("closed");
    expect(fixture.sockets).toHaveLength(0);
    channel.on("message", () => undefined);
    channel.dispose();
    await fixture.flush();
    expect(fixture.sockets).toHaveLength(0);
    await expect(channel.length("x")).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("keeps one pool reference while local subscriptions remain and reacquires after cleanup", async () => {
    const fixture = await setup(hibernate);
    const channel = fixture.handle();
    const offEvent = channel.on("message", () => undefined);
    const offStatus = channel.onStatus(() => undefined);
    await fixture.flush();
    expect(fixture.sockets).toHaveLength(1);
    offEvent();
    await vi.advanceTimersByTimeAsync(50);
    expect([...fixture.host.connections()]).toHaveLength(1);
    offStatus();
    await vi.advanceTimersByTimeAsync(50);
    await fixture.host.flush();
    expect([...fixture.host.connections()]).toHaveLength(0);

    channel.on("message", () => undefined);
    await fixture.flush();
    expect(fixture.sockets).toHaveLength(2);
  });

  it("releases a synchronously cleaned-up subscription before parameter resolution", async () => {
    const fixture = await setup(hibernate);
    const channel = fixture.handle();
    const first = channel.on("message", () => undefined);
    first();
    await fixture.flush();
    expect(fixture.sockets).toHaveLength(0);

    const second = channel.on("message", () => undefined);
    await fixture.flush();
    expect(fixture.sockets).toHaveLength(1);
    second();
    await vi.advanceTimersByTimeAsync(50);
    await fixture.host.flush();
    expect([...fixture.host.connections()]).toHaveLength(0);
  });

  it("releases a fire-and-forget lease only after the queued write reaches the socket", async () => {
    const fixture = await setup(hibernate);
    const channel = fixture.handle();
    channel.publish("queued");
    await vi.advanceTimersByTimeAsync(50);
    expect(fixture.sockets).toHaveLength(1);
    await fixture.host.flush();
    await vi.advanceTimersByTimeAsync(50);
    await fixture.host.flush();
    expect([...fixture.host.connections()]).toHaveLength(0);
  });

  it("releases a settled acknowledgement lease", async () => {
    const fixture = await setup(hibernate);
    const channel = fixture.handle();
    await complete(channel.publish("ack", { ack: true }), fixture.host);
    await vi.advanceTimersByTimeAsync(50);
    await fixture.host.flush();
    expect([...fixture.host.connections()]).toHaveLength(0);
  });

  it("replaces an inactive view's presence snapshot when it subscribes again", async () => {
    const fixture = await setup(hibernate);
    const first = fixture.handle();
    const second = fixture.handle();
    const observe = first.presence.on(() => undefined);
    first.presence.update({ name: "one" });
    second.presence.update({ name: "two" });
    await fixture.flush();
    expect(first.presence.others).toMatchObject([{ d: { name: "two" } }]);
    observe();
    second.dispose();
    await vi.advanceTimersByTimeAsync(50);
    await fixture.flush();

    const resubscribe = first.presence.on(() => undefined);
    await fixture.flush();
    expect(first.presence.others).toEqual([]);
    resubscribe();
  });
});

function channelTypes(client: Client<typeof api>, handle: ChannelHandle<typeof room>): void {
  expectTypeOf(handle.length).returns.toEqualTypeOf<Promise<string>>();
  expectTypeOf(handle.presence.self).toEqualTypeOf<{ name: string } | undefined>();
  handle.on("message", (message, metadata) => {
    expectTypeOf(message).toEqualTypeOf<string>();
    expectTypeOf(metadata.seq).toEqualTypeOf<number | undefined>();
    expectTypeOf(metadata.replayed).toEqualTypeOf<boolean>();
  });
  // @ts-expect-error Channel parameters come from the raw schema input.
  client.room({ id: 1 });
  // @ts-expect-error Procedure input is the string before its schema transform.
  void handle.length(4);
  // @ts-expect-error Presence fields are inferred from the schema.
  handle.presence.update({ name: 1 });
  // @ts-expect-error Only declared server events can be observed.
  handle.on("missing", () => undefined);
  // @ts-expect-error Client event input must match its schema.
  void handle.publish(1);
}
void channelTypes;

describe("channel HTTP fallback", () => {
  it("supports JSON inspection without invoking an unknown contract path", () => {
    const client = createClient({ contract: api });
    expect(() => JSON.stringify({ client })).not.toThrow();
  });

  it("calls a host procedure without opening a socket and refreshes credentials", async () => {
    let token = "first";
    const requests: Request[] = [];
    const client = createClient({
      contract: api,
      url: "https://example.test/_cable",
      auth: { token: () => token },
      fetch: async (url, init) => {
        requests.push(new Request(url, init));
        return Response.json({ id: "host", ok: true, data: "4" });
      },
      ws: {
        createSocket: () => {
          throw new Error("HTTP calls must not open a socket.");
        },
      },
    });
    const channel = client.room({ id: "ONE" });
    disposals.push(() => channel.dispose());
    expect(await channel.length("four")).toBe("4");
    token = "second";
    expect(await channel.length("next")).toBe("4");
    expect(requests.map((request) => request.headers.get("authorization"))).toEqual([
      "Bearer first",
      "Bearer second",
    ]);
    const request = requests[0];
    if (request === undefined) throw new Error("Expected a host request.");
    expect(request.url).toBe("https://example.test/_cable/host/room%3Aone/length");
    expect(await request.json()).toEqual({ params: { id: "ONE" }, input: "four" });
    expect(channel.status).toBe("closed");
  });

  it.each([
    { body: "Unauthorized", status: 401, code: "UNAUTHORIZED" },
    { body: { id: "wrong", ok: true, data: "x" }, status: 200, code: "PARSE_ERROR" },
    { body: { id: "host", ok: true, data: "x" }, status: 401, code: "UNAUTHORIZED" },
    {
      body: {
        id: "host",
        ok: false,
        error: { code: "FORBIDDEN", status: 403, data: { reason: "denied" } },
      },
      status: 403,
      code: "FORBIDDEN",
    },
  ])("rejects invalid or unsuccessful results ($code)", async ({ body, status, code }) => {
    const client = createClient({
      contract: api,
      fetch: async () => Response.json(body, { status }),
    });
    const channel = client.room({ id: "one" });
    disposals.push(() => channel.dispose());
    await expect(channel.length("x")).rejects.toMatchObject({ code });
  });
});

const bare = c.channel("bare.{id}", { server: {}, client: {}, procedures: {} });
function absentCapabilities(handle: ChannelHandle<typeof bare>): void {
  // @ts-expect-error Channels without a presence schema do not expose presence.
  void handle.presence;
  // @ts-expect-error Channels without history retention do not expose history.
  void handle.history;
}
void absentCapabilities;
