import { c } from "@cable/contract";
import { signGrant, type Host, type HostHandlers, type HostKey } from "@cable/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { nodeHost, NodeRuntime, type NodeHandlerHost, type NodeUpgradeSocket } from "./runtime.js";

const secret = "01234567890123456789012345678901";
const channel = c.channel("room.{id}", { client: {}, procedures: {}, server: {} });

function key(value: string): HostKey {
  // SAFETY: Fixtures use a canonical channel key matching the contract pattern.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The fixture establishes the branded key invariant.
  return value as HostKey;
}

function createRuntime(): NodeRuntime {
  return new NodeRuntime([nodeHost(channel, { onClient: {}, procedures: {} })], {
    grantSecret: secret,
  });
}

function trackedHost(
  create: (host: Host, generation: number) => Pick<HostHandlers, "onAlarm" | "onPeer">,
): NodeHandlerHost {
  let generation = 0;
  return {
    channel,
    create(host) {
      const handlers = create(host, ++generation);
      return {
        onAlarm: handlers.onAlarm,
        onClose: async () => undefined,
        onError: async () => undefined,
        onMessage: async () => undefined,
        onPeer: handlers.onPeer,
        onUpgrade: async () => {
          throw new Error("This runtime regression does not upgrade sockets.");
        },
      };
    },
  };
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  if (resolve === undefined) throw new Error("Expected deferred resolver.");
  return { promise, resolve };
}

function socket(): NodeUpgradeSocket {
  const value: NodeUpgradeSocket = {
    bufferedAmount: 0,
    close: () => undefined,
    on: () => value,
    send: () => undefined,
  };
  return value;
}

async function prepare(host: NodeRuntime) {
  const hostKey = key("room:lobby");
  const grant = await signGrant(
    { exp: Date.now() + 1_000, grants: [], hostKey, identity: null, params: { id: "lobby" }, v: 1 },
    secret,
  );
  return host.prepareUpgrade(
    nodeHost(channel, { onClient: {}, procedures: {} }),
    hostKey,
    new Request("https://test/ws"),
    grant,
  );
}

afterEach(() => vi.useRealTimers());

describe("NodeRuntime", () => {
  it("consumes prepared upgrades and rejects foreign or shut-down runtimes", async () => {
    const first = createRuntime();
    const second = createRuntime();
    const prepared = await prepare(first);
    if (!prepared.result.accept) throw new Error("Expected accepted upgrade.");
    // SAFETY: The checked discriminant proves this prepared upgrade carries acceptance metadata.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript does not narrow this nested union across the opaque token boundary.
    const accepted = prepared as Extract<
      typeof prepared,
      { readonly result: { readonly accept: true } }
    >;

    expect(() => second.attachUpgrade(accepted, socket())).toThrow("not prepared");
    first.attachUpgrade(accepted, socket());
    expect(() => first.attachUpgrade(accepted, socket())).toThrow("not prepared");

    const afterShutdown = await prepare(second);
    if (!afterShutdown.result.accept) throw new Error("Expected accepted upgrade.");
    // SAFETY: The checked discriminant proves this prepared upgrade carries acceptance metadata.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript does not narrow this nested union across the opaque token boundary.
    const acceptedAfterShutdown = afterShutdown as Extract<
      typeof afterShutdown,
      { readonly result: { readonly accept: true } }
    >;
    await second.shutdown();
    expect(() => second.attachUpgrade(acceptedAfterShutdown, socket())).toThrow("shut down");
    await first.shutdown();
  });
  it("creates the registered peer host before any socket connects", async () => {
    const other = c.channel("other.{id}", { client: {}, procedures: {}, server: {} });
    const runtime = new NodeRuntime(
      [
        nodeHost(channel, { onClient: {}, procedures: {} }),
        nodeHost(other, { onClient: {}, procedures: {} }),
      ],
      { grantSecret: secret },
    );

    await expect(runtime.peer(key("other:lobby"), { t: "ping" })).resolves.toEqual({ t: "pong" });
    expect(runtime.host(key("other:lobby"))).toBeDefined();
    expect(runtime.host(key("room:lobby"))).toBeUndefined();
    await runtime.shutdown();
  });

  it("keeps host storage while its engine cache is idle-evicted", async () => {
    vi.useFakeTimers();
    const runtime = createRuntime();
    const prepared = await prepare(runtime);
    expect(prepared.result.accept).toBe(true);
    const host = runtime.host(key("room:lobby"));
    if (host === undefined) throw new Error("Expected Node Host.");
    await host.storage.put("ev:1", { text: "kept" });

    await vi.advanceTimersByTimeAsync(300_000);

    await expect(host.storage.get("ev:1")).resolves.toEqual({ text: "kept" });
    await runtime.shutdown();
  });

  it("cancels its pending alarm on shutdown", async () => {
    vi.useFakeTimers();
    const runtime = createRuntime();
    await prepare(runtime);
    const host = runtime.host(key("room:lobby"));
    if (host === undefined) throw new Error("Expected Node Host.");
    expect(await host.schedule.get()).not.toBeNull();

    await runtime.shutdown();

    await expect(host.schedule.get()).resolves.toBeNull();
    await expect(runtime.peer(key("room:lobby"), { t: "ping" })).rejects.toThrow("shut down");
  });

  it("recreates an idle-evicted engine when its retained future alarm fires", async () => {
    vi.useFakeTimers();
    let creations = 0;
    const runtime = new NodeRuntime(
      [
        trackedHost((host, generation) => {
          creations = generation;
          return {
            onAlarm: async () => {
              const retained = await host.storage.get<string>("retained");
              await host.storage.put("fired", { generation, retained });
            },
            onPeer: async () => ({ t: "pong" }),
          };
        }),
      ],
      { grantSecret: secret },
    );
    const hostKey = key("room:lobby");

    await runtime.peer(hostKey, { t: "ping" });
    const host = runtime.host(hostKey);
    if (host === undefined) throw new Error("Expected Node Host.");
    await host.storage.put("retained", "kept");
    await host.schedule.set(Date.now());
    await vi.advanceTimersByTimeAsync(0);
    await host.schedule.set(Date.now() + 300_001);

    await vi.advanceTimersByTimeAsync(300_001);

    expect(creations).toBe(2);
    await expect(host.storage.get("fired")).resolves.toEqual({ generation: 2, retained: "kept" });
    await runtime.shutdown();
  });

  it("retains tracked active work through idle cleanup and shutdown", async () => {
    vi.useFakeTimers();
    const pending = deferred();
    let generations = 0;
    const runtime = new NodeRuntime(
      [
        trackedHost((host, generation) => {
          generations = generation;
          return {
            onAlarm: async () => host.waitUntil(pending.promise),
            onPeer: async () => ({ generation }),
          };
        }),
      ],
      { grantSecret: secret },
    );
    const hostKey = key("room:lobby");

    await runtime.peer(hostKey, { t: "ping" });
    const host = runtime.host(hostKey);
    if (host === undefined) throw new Error("Expected Node Host.");
    await host.schedule.set(Date.now());
    await vi.advanceTimersByTimeAsync(300_000);

    await expect(runtime.peer(hostKey, { t: "ping" })).resolves.toEqual({ generation: 1 });
    let shutDown = false;
    const shutdown = runtime.shutdown().then(() => {
      shutDown = true;
      return undefined;
    });
    await Promise.resolve();
    expect(shutDown).toBe(false);

    pending.resolve();
    await shutdown;
    expect(generations).toBe(1);
  });
});
