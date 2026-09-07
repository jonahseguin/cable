import { c } from "@cablejs/contract";
import { expectTypeOf, it } from "vitest";
import { z } from "zod";

import { implement, isCableError, type ProcedureError } from "./index.js";

const contract = c.contract({
  channel: c.channel("room.{roomId}", {
    client: {},
    server: {},
  }),
  nested: {
    transform: c.query({
      errors: {
        FIRST: z.object({ first: z.string() }),
        SECOND: z.object({ second: z.number() }),
      },
      input: z.string().transform(Number),
      output: z.number().transform(String),
    }),
  },
});

const accessContract = c.contract({
  admin: c.query({ input: z.void(), output: z.string() }),
  public: c.query({ input: z.void(), output: z.string() }),
  room: c.channel("room.{id}", { client: {}, procedures: {}, server: {} }),
});

function compileAssertions(): void {
  implement(contract)
    .context<{ readonly seed: number }>()
    .use(async ({ ctx, next }) => next({ ctx: { parsedSeed: String(ctx.seed) } }))
    .procedures({
      nested: {
        transform: ({ ctx, input }) => {
          const parsedInput: number = input;
          const parsedContext: string = ctx.parsedSeed;
          return parsedInput + parsedContext.length;
        },
      },
    });

  implement(contract)
    .context<object>()
    // @ts-expect-error Global procedure implementations must be complete.
    .procedures({});

  implement(contract)
    .context<object>()
    .procedures({
      nested: {
        // @ts-expect-error Output validation receives the output schema's input type.
        transform: () => "already transformed",
      },
    });

  implement(contract, { validateOutput: false })
    .context<object>()
    .procedures({
      nested: {
        transform: () => "already transformed",
      },
    });

  const builder = implement(accessContract).context<{
    readonly identity: { readonly role: "admin" } | { readonly role: "member" } | null;
  }>();
  const protectedProcedure = builder.procedure.use(async ({ ctx, next }) => {
    if (ctx.identity === null) throw new Error("unauthorized");
    return next({ ctx: { identity: ctx.identity } });
  });
  const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
    const identity = ctx.identity;
    if (identity.role !== "admin") throw new Error("forbidden");
    return next({ ctx: { identity } });
  });
  builder.procedures({
    admin: adminProcedure(accessContract.admin, ({ ctx }) => {
      const role: "admin" = ctx.identity.role;
      return role;
    }),
    public: builder.procedure(accessContract.public, () => "ok"),
  });
  // @ts-expect-error Channel contracts cannot resolve as global procedures.
  builder.procedure(accessContract.room, () => "no");

  const taggedBuilder = builder.use(async ({ ctx, next }) =>
    next({ ctx: { identity: ctx.identity, requestTag: "tagged" } }),
  );
  const taggedProcedure = taggedBuilder.procedure;
  taggedBuilder.procedures({
    admin: taggedProcedure(accessContract.admin, ({ ctx }) => {
      const tag: string = ctx.requestTag;
      return tag;
    }),
    public: taggedProcedure(accessContract.public, ({ ctx }) => ctx.requestTag),
  });

  const stronger = implement(accessContract).context<{
    readonly identity: { readonly id: string };
  }>();
  const strongerLeaf = stronger.procedure(accessContract.public, ({ ctx }) => ctx.identity.id);
  // @ts-expect-error A resolver requiring identity cannot mount on a builder whose initial context lacks it.
  builder.procedures({ admin: () => "admin", public: strongerLeaf });
}

/** Proves that code checks retain the payload paired with each declared error. */
export function declaredErrorPayload(
  error: ProcedureError<typeof contract.nested.transform>,
): string | number | undefined {
  if (isCableError(error, "FIRST")) {
    return error.data.first;
  }
  if (isCableError(error, "SECOND")) {
    return error.data.second;
  }
  return undefined;
}

it("preserves compile-time procedure contracts", () => {
  expectTypeOf(compileAssertions).toBeFunction();
  expectTypeOf(declaredErrorPayload).toBeFunction();
});
