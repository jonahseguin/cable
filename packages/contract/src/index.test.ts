import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  c,
  isChannelContract,
  isContract,
  isProcedureContract,
  type InferChannelParams,
  type InferClientEventErrors,
  type InferClientEventInput,
  type InferErrors,
  type InferInput,
  type InferOutput,
  type InferPresence,
  type InferServerEvent,
} from "./index.js";

const stringSchema = z.string();
const numberSchema = z.number();
const transformedSchema = z.string().regex(/^\d+$/).transform(Number);

describe("contract DSL", () => {
  it("preserves the root object and brands it without adding an enumerable key", () => {
    const definition = { greeting: c.query({ input: stringSchema, output: stringSchema }) };
    const contract = c.contract(definition);

    expect(contract).toBe(definition);
    expect(Object.keys(contract)).toEqual(["greeting"]);
    expect(isContract(contract)).toBe(true);
    expect(isProcedureContract(contract.greeting)).toBe(true);
  });

  it("normalizes channel events and validates generated pattern params", async () => {
    const room = c.channel("chat.{roomId}.{threadId}", {
      client: {
        ping: stringSchema,
        send: { errors: { MUTED: numberSchema }, input: transformedSchema },
      },
      history: { max: 10_000, retain: "24h" },
      presence: numberSchema,
      procedures: {
        rename: c.mutation({ input: stringSchema, output: stringSchema }),
      },
      server: { message: transformedSchema },
    });

    expect(isChannelContract(room)).toBe(true);
    expect(room.paramNames).toEqual(["roomId", "threadId"]);
    expect(room.client.ping.errors).toEqual({});
    expect(room.client.send.errors).toEqual({ MUTED: numberSchema });
    await expect(
      Promise.resolve(room.params["~standard"].validate({ roomId: "one", threadId: "two" })),
    ).resolves.toEqual({ value: { roomId: "one", threadId: "two" } });
    const invalidResult = await room.params["~standard"].validate({
      extra: "two",
      roomId: "one",
    });
    expect("issues" in invalidResult).toBe(true);
  });

  it("rejects malformed procedure, event, history, and pattern definitions", () => {
    expect(() =>
      c.query({
        input: stringSchema,
        output: numberSchema,
        // @ts-expect-error Runtime callers can still supply unknown definition keys.
        surprise: true,
      }),
    ).toThrow("unknown key 'surprise'");
    expect(() => c.channel("chat.{roomId}.{roomId}", { client: {}, server: {} })).toThrow(
      "Duplicate parameter 'roomId'",
    );
    expect(() => c.channel("chat.{room-id}", { client: {}, server: {} })).toThrow(
      "Invalid parameter segment",
    );
    expect(() =>
      c.channel("chat", {
        client: {},
        // @ts-expect-error Runtime callers can still supply invalid retention values.
        history: { max: 0, retain: "forever" },
        server: {},
      }),
    ).toThrow("positive integer max");
    expect(() =>
      c.channel("chat", {
        client: {
          // @ts-expect-error Runtime callers can still supply non-schema event inputs.
          send: { input: "invalid" },
        },
        server: {},
      }),
    ).toThrow("must implement Standard Schema v1");
  });

  it("rejects non-node leaves and contract cycles", () => {
    expect(() =>
      c.contract({
        // @ts-expect-error Runtime callers can still supply arbitrary leaves.
        invalid: 1,
      }),
    ).toThrow("is not a cable node");

    interface CyclicCandidate {
      self?: CyclicCandidate;
    }
    const cyclic: CyclicCandidate = {};
    cyclic.self = cyclic;
    // @ts-expect-error The self-reference has not been parsed as a ContractTree.
    expect(() => c.contract(cyclic)).toThrow("contains a cycle");
  });

  it.each(["then", "__proto__", "prototype", "constructor"])(
    "rejects the reserved router key %s",
    (name) => {
      const definition = {
        [name]: c.query({ input: stringSchema, output: stringSchema }),
      };
      expect(() => c.contract(definition)).toThrow(`Contract key '${name}' is reserved`);
    },
  );

  it.each(["with.dot", "with/slash", ""])("rejects the ambiguous router key %s", (name) => {
    const definition = { [name]: c.query({ input: stringSchema, output: stringSchema }) };
    expect(() => c.contract(definition)).toThrow("contains a path separator");
  });
});

describe("node inference", () => {
  const getCount = c.query({
    errors: { MISSING: stringSchema },
    input: transformedSchema,
    output: transformedSchema,
    transport: { cache: "public, max-age=30", method: "GET" },
  });
  const room = c.channel("chat.{roomId}", {
    client: {
      send: { errors: { MUTED: transformedSchema }, input: transformedSchema },
    },
    presence: transformedSchema,
    server: { message: transformedSchema },
  });

  it("keeps input, output, error, event, presence, and params inference local", () => {
    expectTypeOf<InferInput<typeof getCount>>().toEqualTypeOf<string>();
    expectTypeOf<InferOutput<typeof getCount>>().toEqualTypeOf<number>();
    expectTypeOf<InferErrors<typeof getCount>>().toEqualTypeOf<{
      readonly code: "MISSING";
      readonly data: string;
    }>();
    expectTypeOf<InferChannelParams<typeof room>>().toEqualTypeOf<Readonly<{ roomId: string }>>();
    expectTypeOf<InferServerEvent<typeof room, "message">>().toEqualTypeOf<number>();
    expectTypeOf<InferClientEventInput<typeof room, "send">>().toEqualTypeOf<string>();
    expectTypeOf<InferClientEventErrors<typeof room, "send">>().toEqualTypeOf<{
      readonly code: "MUTED";
      readonly data: number;
    }>();
    expectTypeOf<InferPresence<typeof room>>().toEqualTypeOf<number>();
  });

  const invalidMutation = (): boolean =>
    isProcedureContract(
      // @ts-expect-error Mutations cannot opt into GET transport.
      c.mutation({ input: stringSchema, output: stringSchema, transport: { method: "GET" } }),
    );
  const invalidQuery = (): boolean =>
    // @ts-expect-error Procedure inputs must implement Standard Schema.
    isProcedureContract(c.query({ input: "not a schema", output: stringSchema }));
  // @ts-expect-error The channel does not declare a `missing` server event.
  const invalidEvent: keyof typeof room.server = "missing";

  expectTypeOf(invalidMutation).returns.toBeBoolean();
  expectTypeOf(invalidQuery).returns.toBeBoolean();
  expectTypeOf(invalidEvent).toEqualTypeOf<"message">();
});
