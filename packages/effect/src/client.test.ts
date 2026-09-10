import { createMemoryHost } from "@cablejs/adapter-memory";
import { createClient } from "@cablejs/client";
import { c } from "@cablejs/contract";
import { CableError, resolveChannel, signGrant } from "@cablejs/core";
import { Effect, Fiber, Stream } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { effectClient } from "./client.js";
import type { EffectChannel, EffectClient, EffectProcedureError } from "./client.js";

const room = c.channel("room.{id}", {
  server: { message: z.string() },
  client: {
    publish: { input: z.string(), errors: { MUTED: z.object({ until: z.number() }) } },
  },
  procedures: {
    length: c.query({
      input: z.string(),
      output: z.number(),
      errors: { FORBIDDEN: z.object({ reason: z.string() }) },
    }),
  },
});
const api = c.contract({
  posts: {
    create: c.mutation({
      input: z.string(),
      output: z.string(),
      errors: { FORBIDDEN: z.object({ reason: z.string() }) },
    }),
  },
  room,
});
const secret = "effect client test grant secret 123456789";

async function setup() {
  const resolved = await resolveChannel(room, { id: "one" });
  const host = createMemoryHost(
    room,
    {
      onClient: {
        async publish(context, message) {
          if (message === "muted") throw new CableError("MUTED", { data: { until: 42 } });
          await context.emit("message", message);
        },
      },
      procedures: {
        length: (_context, value) => {
          if (value === "forbidden")
            throw new CableError("FORBIDDEN", { data: { reason: "policy" } });
          return value.length;
        },
      },
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
  const raw = createClient({
    contract: api,
    url: "https://example.test/_cable",
    ws: {
      idleClose: 0,
      createSocket(url) {
        return host.connect(new Request(url), grant);
      },
    },
  });
  return { client: effectClient(api, raw), host, raw };
}

describe("effect client", () => {
  it("aborts an HTTP procedure when its Effect fiber is interrupted", async () => {
    let signal: AbortSignal | undefined;
    const raw = createClient({
      contract: api,
      fetch: async (_url, init) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      },
    });
    const fiber = Effect.runFork(effectClient(api, raw).posts.create.mutate("pending"));
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(signal?.aborted).toBe(true);
  });

  it("turns procedure rejections into declared Cable failures", async () => {
    const client = effectClient(
      api,
      createClient({
        contract: api,
        links: [
          () => async () => ({
            id: "1",
            ok: false,
            error: { code: "FORBIDDEN", data: { reason: "policy" }, status: 403 },
          }),
        ],
      }),
    );

    const exit = await Effect.runPromiseExit(client.posts.create.mutate("blocked"));
    expect(exit).toMatchObject({ _tag: "Failure" });
  });

  it("releases only the interrupted stream and closes after the final stream", async () => {
    const { client, host } = await setup();
    const channel = client.room({ id: "one" });
    expect(channel.stream("message")).toBeDefined();
    const first: string[] = [];
    const second: string[] = [];
    const firstFiber = Effect.runFork(
      Stream.runForEach(channel.stream("message"), (message) =>
        Effect.sync(() => {
          first.push(message);
        }),
      ),
    );
    const secondFiber = Effect.runFork(
      Stream.runForEach(channel.stream("message"), (message) =>
        Effect.sync(() => {
          second.push(message);
        }),
      ),
    );
    await Effect.runPromise(Effect.yieldNow);
    await host.flush();
    expect([...host.connections()]).toHaveLength(1);
    await Effect.runPromise(Fiber.interrupt(firstFiber));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await host.flush();
    expect([...host.connections()]).toHaveLength(1);

    await Effect.runPromise(channel.publish("hello"));
    await host.flush();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(first).toEqual([]);
    expect(second).toEqual(["hello"]);
    await expect(Effect.runPromise(channel.length("four"))).resolves.toBe(4);

    await Effect.runPromise(Fiber.interrupt(secondFiber));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await host.flush();
    expect([...host.connections()]).toEqual([]);
  });

  it("retains stream delivery through a host hibernation", async () => {
    const { client, host } = await setup();
    const channel = client.room({ id: "one" });
    const received: string[] = [];
    const fiber = Effect.runFork(
      Stream.runForEach(channel.stream("message"), (message) =>
        Effect.sync(() => {
          received.push(message);
        }),
      ),
    );
    await Effect.runPromise(Effect.yieldNow);
    await host.flush();
    expect([...host.connections()]).toHaveLength(1);
    await host.hibernate();
    await Effect.runPromise(channel.publish("after-hibernation"));
    await host.flush();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(received).toEqual(["after-hibernation"]);

    await Effect.runPromise(Fiber.interrupt(fiber));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await host.flush();
    expect([...host.connections()]).toEqual([]);
  });
});

function effectClientTypes(
  client: EffectClient<typeof api>,
  channel: EffectChannel<typeof room>,
): void {
  expectTypeOf(client.posts.create.mutate).returns.toEqualTypeOf<
    Effect.Effect<string, EffectProcedureError<typeof api.posts.create>>
  >();
  expectTypeOf(channel.length).returns.toEqualTypeOf<
    Effect.Effect<number, EffectProcedureError<typeof room.procedures.length>>
  >();
  expectTypeOf(channel.stream("message")).toEqualTypeOf<
    Stream.Stream<string, CableError<string>>
  >();
  expectTypeOf<CableError<"FORBIDDEN", { reason: string }>>().toExtend<
    EffectProcedureError<typeof api.posts.create>
  >();
  // @ts-expect-error Undeclared application errors cannot enter this procedure's Effect error type.
  const undeclared: EffectProcedureError<typeof api.posts.create> = new CableError("MUTED");
  void undeclared;
  // @ts-expect-error The stream event must be declared by the channel.
  channel.stream("missing");
  // @ts-expect-error Client event payloads retain their schema input type.
  void channel.publish(1);
}
void effectClientTypes;
