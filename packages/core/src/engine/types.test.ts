import { c } from "@cable/contract";
import { expectTypeOf, it } from "vitest";
import { z } from "zod";

import type { ChannelImplementation } from "./types.js";

const channel = c.channel("room.{roomId}", {
  client: {
    publish: z.string().transform(Number),
  },
  params: z.object({ roomId: z.string().transform((value) => value.toUpperCase()) }),
  procedures: {
    inspect: c.query({
      input: z.string().transform(Number),
      output: z.number().transform(String),
    }),
  },
  server: {
    changed: z.number().transform(String),
  },
});

interface Identity {
  readonly userId: string;
}

interface Timers {
  readonly expire: { readonly itemId: string };
}

function acceptImplementation(
  _implementation: ChannelImplementation<typeof channel, Identity, Timers>,
): void {}

function compileChannelImplementation(): void {
  const implementation = {
    onClient: {
      async publish(context, input) {
        const parsedInput: number = input;
        const parsedParam: string = context.params.roomId;
        const typedIdentity: string = context.identity.userId;
        await context.emit("changed", parsedInput + parsedParam.length + typedIdentity.length);
        await context.schedule("expire", context.now() + 1_000, { itemId: "one" });
      },
    },
    procedures: {
      inspect(context, input) {
        const parsedInput: number = input;
        const optionalConnection = context.connection;
        optionalConnection?.close();
        return parsedInput;
      },
    },
    timers: {
      async expire(context, input) {
        await context.storage.put(`expired:${input.itemId}`, context.now());
      },
    },
  } satisfies ChannelImplementation<typeof channel, Identity, Timers>;

  acceptImplementation(implementation);

  const incomplete = {
    onClient: {},
    procedures: {
      inspect: () => 1,
    },
  };
  // @ts-expect-error Every declared client event requires a handler.
  incomplete satisfies ChannelImplementation<typeof channel, Identity>;

  const invalidOutput = {
    onClient: { publish: () => undefined },
    procedures: {
      inspect: () => "already transformed",
    },
  };
  // @ts-expect-error Procedure handlers return the output schema's input type.
  invalidOutput satisfies ChannelImplementation<typeof channel, Identity>;
}

it("preserves channel handler and context types", () => {
  expectTypeOf(compileChannelImplementation).toBeFunction();
});
