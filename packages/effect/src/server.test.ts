import { c } from "@cablejs/contract";
import { CableError } from "@cablejs/core";
import { Context, Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { implementEffect, typedEffect } from "./server.js";

const Prefix = Context.Service<{ readonly value: string }>("@cablejs/effect/test/Prefix");

const api = c.contract({
  greet: c.query({
    input: Schema.toStandardSchemaV1(Schema.String),
    output: Schema.toStandardSchemaV1(Schema.String),
  }),
  guarded: c.mutation({
    errors: { NOT_READY: Schema.toStandardSchemaV1(Schema.Struct({ retryAt: Schema.Number })) },
    input: Schema.toStandardSchemaV1(Schema.Void),
    output: Schema.toStandardSchemaV1(Schema.String),
  }),
});

describe("implementEffect", () => {
  it("provides the supplied Layer and keeps Effect Schema at the Standard Schema boundary", async () => {
    const procedures = implementEffect(api)
      .context<{}>()
      .procedures({
        greet: ({ input }) =>
          Effect.map(Effect.service(Prefix), (prefix) => `${prefix.value}:${input}`),
        guarded: () => Effect.succeed("ready"),
      })
      .toCore(Layer.succeed(Prefix)({ value: "hello" }));

    await expect(
      procedures.execute({ id: "1", input: "world", path: "greet" }, {}),
    ).resolves.toEqual({
      data: "hello:world",
      id: "1",
      ok: true,
    });
  });

  it("returns declared Effect failures through cable's existing error dispatcher", async () => {
    const procedures = implementEffect(api)
      .context<{}>()
      .procedures({
        greet: () => Effect.succeed("unused"),
        guarded: () =>
          typedEffect(
            Effect.fail(
              new CableError("NOT_READY", { data: { retryAt: 10 }, message: "Try later" }),
            ),
          ),
      })
      .toCore(Layer.empty);

    await expect(
      procedures.execute({ id: "2", input: undefined, path: "guarded" }, {}),
    ).resolves.toEqual({
      error: {
        code: "NOT_READY",
        data: { retryAt: 10 },
        message: "Try later",
        status: 400,
      },
      id: "2",
      ok: false,
    });
  });

  it("builds a local Layer scope for each core procedure invocation", async () => {
    let builds = 0;
    const procedures = implementEffect(api)
      .context<{}>()
      .procedures({
        greet: ({ input }) =>
          Effect.map(Effect.service(Prefix), (prefix) => `${prefix.value}:${input}`),
        guarded: () => Effect.succeed("ready"),
      })
      .toCore(
        Layer.sync(Prefix)(() => {
          builds += 1;
          return { value: "local" };
        }),
      );

    await procedures.execute({ id: "3", input: "one", path: "greet" }, {});
    await procedures.execute({ id: "4", input: "two", path: "greet" }, {});
    expect(builds).toBe(2);
  });

  it("releases scoped Layer resources after successful and failed procedures", async () => {
    let releases = 0;
    const procedures = implementEffect(api)
      .context<{}>()
      .procedures({
        greet: ({ input }) =>
          Effect.map(Effect.service(Prefix), (prefix) => `${prefix.value}:${input}`),
        guarded: () => Effect.fail(new CableError("NOT_READY", { data: { retryAt: 10 } })),
      })
      .toCore(
        Layer.effect(Prefix)(
          Effect.acquireRelease(Effect.succeed({ value: "scoped" }), () =>
            Effect.sync(() => {
              releases += 1;
            }),
          ),
        ),
      );

    await procedures.execute({ id: "5", input: "success", path: "greet" }, {});
    await procedures.execute({ id: "6", input: undefined, path: "guarded" }, {});
    expect(releases).toBe(2);
  });
});
