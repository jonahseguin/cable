import { c } from "@cable/contract";
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
