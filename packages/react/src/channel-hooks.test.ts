// @vitest-environment jsdom

import { createMemoryHost } from "@cable/adapter-memory";
import { createClient } from "@cable/client";
import type { ChannelHandle, ChannelHistoryPage } from "@cable/client";
import { c } from "@cable/contract";
import type { InferServerEvent } from "@cable/contract";
import { resolveChannel, signGrant } from "@cable/core";
import { act, createElement, StrictMode, useEffect } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";

import {
  useChannel,
  useEvent,
  usePresence,
  type ChannelHookHandle,
  type PresenceHandle,
} from "./index.js";

const room = c.channel("room.{id}", {
  params: z.object({ id: z.string().transform((value) => value.toLowerCase()) }),
  server: { message: z.string() },
  client: {},
  procedures: {},
  presence: z.object({ name: z.string() }),
});
const api = c.contract({ room });
const typedRoom = c.channel("typed.{id}", {
  params: z.object({ id: z.string() }).transform(({ id }) => ({ id: Number(id) })),
  server: { notice: z.string().transform(Number) },
  client: { send: z.string() },
  history: { max: 1, retain: "1h" },
  presence: z.object({ online: z.boolean() }),
});
const typedApi = c.contract({ typedRoom });
const typedClient = createClient({ contract: typedApi });
const secret = "react hooks grant secret 123456789";

function ClientApp({ client }: { readonly client: ReturnType<typeof createClient<typeof api>> }) {
  useChannel(client.room, { id: "ONE" });
  return null;
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function hookTypes() {
  const handle = useChannel(typedClient.typedRoom, { id: "1" });
  const presence = usePresence(handle);
  const page = handle.history.load();
  expectTypeOf(page).toEqualTypeOf<Promise<ChannelHistoryPage<typeof typedRoom>>>();
  expectTypeOf(presence.self).toEqualTypeOf<{ online: boolean } | undefined>();
  useEvent(handle, "notice", (notice) => {
    expectTypeOf(notice).toEqualTypeOf<number>();
  });
  presence.update({ online: true });
  // @ts-expect-error Channel factory parameters use the schema input, before transformation.
  useChannel(typedClient.typedRoom, { id: 1 });
  // @ts-expect-error Presence updates use the presence schema input.
  presence.update({ online: "yes" });
}
void hookTypes;

type ChannelOf<Handle> = Handle extends ChannelHandle<infer Channel> ? Channel : never;
type TypedHandleChannel = ChannelOf<ReturnType<typeof typedClient.typedRoom>>;
expectTypeOf<InferServerEvent<TypedHandleChannel, "notice">>().toEqualTypeOf<number>();
expectTypeOf<ChannelHandle<typeof typedRoom>>().toExtend<ChannelHookHandle>();
expectTypeOf<ChannelHandle<typeof typedRoom>>().toExtend<
  PresenceHandle<{ online: boolean }, { online: boolean }>
>();

function outlet(): HTMLDivElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

async function fixture() {
  const resolved = await resolveChannel(room, { id: "ONE" });
  const host = createMemoryHost(
    room,
    { onClient: {}, procedures: {} },
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
  let sockets = 0;
  function client() {
    return createClient({
      contract: api,
      url: "https://example.test/_cable",
      ws: {
        idleClose: 0,
        createSocket(url) {
          sockets += 1;
          return host.connect(new Request(url), grant);
        },
      },
    });
  }
  async function flush() {
    await Promise.resolve();
    await host.flush();
    await Promise.resolve();
  }
  return {
    client: client(),
    createClient: client,
    flush,
    get sockets() {
      return sockets;
    },
    host,
  };
}

describe("channel hooks", () => {
  it("does not open a channel while rendering on the server", async () => {
    const value = await fixture();
    function App() {
      useChannel(value.client.room, { id: "ONE" });
      return null;
    }

    expect(renderToString(createElement(App))).toBe("");
    expect(value.sockets).toBe(0);
  });

  it("opens after hydration and releases the subscription without disposing its handle", async () => {
    const value = await fixture();
    function App() {
      useChannel(value.client.room, { id: "ONE" });
      return createElement("span", undefined, "room");
    }
    const node = outlet();
    node.innerHTML = renderToString(createElement(App));
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(node, createElement(StrictMode, undefined, createElement(App)));
      await value.flush();
    });
    expect(value.sockets).toBe(1);
    await act(async () => {
      if (root === undefined) throw new Error("Expected hydration root.");
      root.unmount();
    });
    expect([...value.host.connections()]).toHaveLength(1);
  });

  it("shares a channel for structurally equal parameters and rebinds events to the latest callback", async () => {
    const value = await fixture();
    const received: string[] = [];
    function App({ suffix }: { readonly suffix: string }) {
      const handle = useChannel(value.client.room, { id: "ONE" });
      useEvent(handle, "message", (message) => received.push(message + suffix));
      useChannel(value.client.room, { id: "ONE" });
      return null;
    }
    const root = createRoot(outlet());
    await act(async () => {
      root.render(createElement(App, { suffix: "-one" }));
      await value.flush();
    });
    expect(value.sockets).toBe(1);
    await act(async () => {
      root.render(createElement(App, { suffix: "-two" }));
      await value.flush();
    });
    await act(async () => {
      await value.host.peers.send(value.host.key, { t: "emit", ev: "message", d: "hello" });
      await value.flush();
    });
    expect(received).toEqual(["hello-two"]);
    await act(async () => {
      root.unmount();
      await value.flush();
    });
  });

  it("keeps a shared channel live until its final consumer unmounts", async () => {
    vi.useFakeTimers();
    const value = await fixture();
    function Second() {
      useChannel(value.client.room, { id: "ONE" });
      return null;
    }
    function App({ second }: { readonly second: boolean }) {
      useChannel(value.client.room, { id: "ONE" });
      return second ? createElement(Second) : null;
    }
    const root = createRoot(outlet());
    await act(async () => {
      root.render(createElement(App, { second: true }));
      await value.flush();
    });
    expect(value.sockets).toBe(1);
    await act(async () => {
      root.render(createElement(App, { second: false }));
      await value.flush();
    });
    expect([...value.host.connections()]).toHaveLength(1);
    await act(async () => {
      root.unmount();
      await vi.advanceTimersByTimeAsync(0);
      await value.flush();
    });
    expect([...value.host.connections()]).toHaveLength(0);
  });

  it("rebinds a channel when the client factory changes", async () => {
    const value = await fixture();
    const replacement = value.createClient();
    const root = createRoot(outlet());
    await act(async () => {
      root.render(createElement(ClientApp, { client: value.client }));
      await value.flush();
    });
    await act(async () => {
      root.render(createElement(ClientApp, { client: replacement }));
      await value.flush();
    });
    expect(value.sockets).toBe(2);
    await act(async () => {
      root.unmount();
      await value.flush();
    });
  });

  it("returns stable server presence snapshots and rerenders on presence updates", async () => {
    const value = await fixture();
    const serverSnapshots: object[] = [];
    function ServerApp() {
      const handle = useChannel(value.client.room, { id: "ONE" });
      serverSnapshots.push(usePresence(handle));
      return null;
    }
    renderToString(createElement(ServerApp));
    renderToString(createElement(ServerApp));
    expect(serverSnapshots[0]).toBe(serverSnapshots[1]);

    let self: { readonly name: string } | undefined;
    function App() {
      const handle = useChannel(value.client.room, { id: "ONE" });
      const presence = usePresence(handle);
      useEffect(() => {
        presence.update({ name: "one" });
      }, []);
      self = presence.self;
      return null;
    }
    const root = createRoot(outlet());
    await act(async () => {
      root.render(createElement(App));
      await value.flush();
    });
    await act(async () => {
      await value.flush();
    });
    expect(self).toEqual({ name: "one" });
    await act(async () => {
      root.unmount();
      await value.flush();
    });
  });
});
