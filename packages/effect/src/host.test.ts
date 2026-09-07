import {
  ManualClock,
  MemoryConnection,
  MemoryHostRegistry,
  MemorySocket,
  MemoryStorage,
} from "@cablejs/adapter-memory";
import { c } from "@cablejs/contract";
import {
  CableError,
  encodeClientFrame,
  resolveChannel,
  signGrant,
  type Host,
  type HostHandlers,
} from "@cablejs/core";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createEffectEngine,
  Host as EffectHost,
  type EffectChannelImplementation,
} from "./host.js";

const transformedError = z.object({ reason: z.string().transform(Number) });
const channel = c.channel("effect.{id}", {
  client: { publish: { input: z.string(), errors: { DENIED: transformedError } } },
  server: { message: z.string() },
  procedures: {
    key: c.query({ input: z.string(), output: z.string(), errors: { DENIED: transformedError } }),
  },
});
const secret = "effect host lifecycle test secret 123456";

const outputOnlyErrors = {
  onClient: { publish: () => Effect.fail(new CableError("DENIED", { data: { reason: 7 } })) },
  procedures: { key: () => Effect.fail(new CableError("DENIED", { data: { reason: 7 } })) },
};
// @ts-expect-error Transformed errors accept schema input (`string`), not parsed output (`number`).
outputOnlyErrors satisfies EffectChannelImplementation<
  typeof channel,
  null,
  Record<never, never>,
  never
>;

describe("createEffectEngine", () => {
  it("retains effectful output and timers through handler reconstruction", async () => {
    const resolved = await resolveChannel(channel, { id: "one" });
    const clock = new ManualClock();
    let handlers: HostHandlers | undefined;
    const connections: MemoryConnection[] = [];
    const host: Host = {
      key: resolved.key,
      limits: { attachmentBytes: 2048, maxFrameBytes: 1048576 },
      peers: new MemoryHostRegistry().createPeers(),
      schedule: clock.createSchedule(async () => handlers?.onAlarm()),
      storage: new MemoryStorage(),
      connections: () => connections,
      now: () => clock.now(),
      waitUntil: () => undefined,
    };
    const failures: unknown[] = [];
    // SAFETY: the fixture's named handlers exactly match this closed channel; this
    // isolates the runtime Host reconstruction test from recursive contract inference.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test fixture supplies every channel callback.
    const implementation = {
      onClient: {
        publish: (
          context: {
            emit: (name: "message", value: string) => Effect.Effect<number>;
            schedule: (kind: "remind", at: number, args: string) => Effect.Effect<string>;
          },
          value: string,
        ) =>
          value === "deny"
            ? Effect.fail(new CableError("DENIED", { data: { reason: "7" } }))
            : Effect.gen(function* () {
                expect(yield* Effect.service(EffectHost)).toBe(host);
                yield* context.emit("message", `client:${value}`);
                yield* context.schedule("remind", 1, value);
              }),
      },
      procedures: {
        key: (_context: { readonly hostKey: string }, value: string) =>
          value === "deny"
            ? Effect.fail(new CableError("DENIED", { data: { reason: "7" } }))
            : Effect.map(Effect.service(EffectHost), (service) => service.key),
      },
      timers: {
        remind: (
          context: { emit: (name: "message", value: string) => Effect.Effect<number> },
          value: string,
        ) => context.emit("message", `timer:${value}`),
      },
      onError: ({ error }: { error: unknown }) =>
        Effect.sync(() => {
          failures.push(error);
        }),
    } as never;
    handlers = createEffectEngine(
      channel,
      implementation,
      host,
      { grantSecret: secret },
      Layer.empty,
    );
    const grant = await signGrant(
      {
        v: 1,
        hostKey: resolved.key,
        params: resolved.params,
        identity: null,
        grants: [],
        exp: 60000,
      },
      secret,
    );
    const upgrade = await handlers.onUpgrade(new Request("https://example.test"), grant);
    if (!upgrade.accept) throw new Error("upgrade failed");
    const connection = new MemoryConnection(
      upgrade.attachment.cid,
      upgrade.tags,
      upgrade.attachment,
      new MemorySocket(() => undefined),
      () => undefined,
    );
    connections.push(connection);
    const sent: string[] = [];
    connection.send = (frame) => {
      sent.push(JSON.stringify(frame));
    };
    await handlers.onMessage(connection, encodeClientFrame({ t: "hello", v: 1 }));
    await handlers.onMessage(connection, encodeClientFrame({ t: "emit", ev: "publish", d: "one" }));
    await handlers.onMessage(
      connection,
      encodeClientFrame({ t: "emit", ev: "publish", d: "deny", id: "event" }),
    );
    await handlers.onMessage(
      connection,
      encodeClientFrame({ t: "call", p: "key", d: "ignored", id: "key" }),
    );
    await handlers.onMessage(
      connection,
      encodeClientFrame({ t: "call", p: "key", d: "deny", id: "deny" }),
    );
    expect(failures).toHaveLength(2);
    expect(sent.some((frame) => frame.includes("client:one"))).toBe(true);
    expect(sent.some((frame) => frame.includes(resolved.key))).toBe(true);
    expect(sent.some((frame) => frame.includes("DENIED"))).toBe(true);
    expect(
      sent.filter((frame) => frame.includes('"e"')).every((frame) => frame.includes('"reason":7')),
    ).toBe(true);
    handlers = createEffectEngine(
      channel,
      implementation,
      host,
      { grantSecret: secret },
      Layer.empty,
    );
    await clock.advanceTime(1);
    expect(failures).toHaveLength(2);
    expect(sent.some((frame) => frame.includes("timer:one"))).toBe(true);
  });
});
