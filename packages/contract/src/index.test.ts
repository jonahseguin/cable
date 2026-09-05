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
  it("preserves and freezes the branded tree without adding enumerable keys", () => {
    const definition = {
      nested: { greeting: c.query({ input: stringSchema, output: stringSchema }) },
    };
    const contract = c.contract(definition);

    expect(contract).toBe(definition);
    expect(Object.keys(contract)).toEqual(["nested"]);
    expect(Object.keys(contract.nested.greeting)).toEqual(["errors", "input", "kind", "output"]);
    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.nested)).toBe(true);
    expect(
      Reflect.set(contract, "late", c.query({ input: stringSchema, output: stringSchema })),
    ).toBe(false);
    expect(isContract(contract)).toBe(true);
    expect(isProcedureContract(contract.nested.greeting)).toBe(true);
  });

  it("rejects structural lookalikes that were not built by the DSL", () => {
    const lookalike = {
      errors: {},
      input: stringSchema,
      kind: "query" as const,
      output: stringSchema,
    };

    expect(isProcedureContract(lookalike)).toBe(false);
    expect(() =>
      c.contract({
        // @ts-expect-error Contract leaves must carry the DSL-installed node brand.
        lookalike,
      }),
    ).toThrow("is not a cable node");
  });

  it("rejects branch accessors without evaluating them", () => {
    let reads = 0;
    const definition = Object.defineProperty({}, "unstable", {
      enumerable: true,
      get() {
        reads += 1;
        return c.query({ input: stringSchema, output: stringSchema });
      },
    });

    expect(() => c.contract(definition)).toThrow(
      "Contract property 'unstable' must be a data property",
    );
    expect(reads).toBe(0);
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

  it.each(["then", "__proto__", "prototype", "constructor"])(
    "rejects the reserved channel parameter %s",
    (name) => {
      expect(() => c.channel(`chat.{${name}}`, { client: {}, server: {} })).toThrow(
        `Channel parameter '${name}' is reserved`,
      );
    },
  );

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

  it("rejects channel members that collide with the handle API", () => {
    expect(() =>
      c.channel("chat", {
        client: { onStatus: stringSchema },
        server: {},
      }),
    ).toThrow("Channel client event name 'onStatus' is reserved");
    expect(() =>
      c.channel("chat", {
        client: {},
        procedures: {
          history: c.query({ input: stringSchema, output: stringSchema }),
        },
        server: {},
      }),
    ).toThrow("Channel procedure name 'history' is reserved");
    expect(() =>
      c.channel("chat", {
        client: {},
        server: { reset: stringSchema },
      }),
    ).toThrow("Channel server event name 'reset' is reserved");
    expect(() =>
      c.channel("chat", {
        client: { send: stringSchema },
        procedures: { send: c.mutation({ input: stringSchema, output: stringSchema }) },
        server: {},
      }),
    ).toThrow("cannot be both a client event and a procedure");
  });

  it("rejects overlapping channel patterns in one contract", () => {
    expect(() =>
      c.contract({
        admin: c.channel("chat.admin", { client: {}, server: {} }),
        room: c.channel("chat.{roomId}", { client: {}, server: {} }),
      }),
    ).toThrow("'chat.{roomId}' at 'room' overlaps 'chat.admin' at 'admin'");

    expect(() =>
      c.contract({
        first: c.channel("chat.{roomId}", { client: {}, server: {} }),
        nested: {
          second: c.channel("chat.{slug}", { client: {}, server: {} }),
        },
      }),
    ).toThrow("'chat.{slug}' at 'nested.second' overlaps 'chat.{roomId}' at 'first'");

    expect(() =>
      c.contract({
        admin: c.channel("chat.admin", { client: {}, server: {} }),
        room: c.channel("chat.room", { client: {}, server: {} }),
      }),
    ).not.toThrow();
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
  const noErrors = c.mutation({ input: stringSchema, output: numberSchema });
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
    expectTypeOf<InferErrors<typeof noErrors>>().toEqualTypeOf<never>();
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
  const invalidExplicitErrors = (): boolean =>
    isProcedureContract(
      c.query<typeof stringSchema, typeof stringSchema, { BROKEN: typeof numberSchema }>(
        // @ts-expect-error Explicit error maps require a matching runtime errors definition.
        { input: stringSchema, output: stringSchema },
      ),
    );
  // @ts-expect-error The channel does not declare a `missing` server event.
  const invalidEvent: keyof typeof room.server = "missing";

  expectTypeOf(invalidMutation).returns.toBeBoolean();
  expectTypeOf(invalidQuery).returns.toBeBoolean();
  expectTypeOf(invalidExplicitErrors).returns.toBeBoolean();
  expectTypeOf(invalidEvent).toEqualTypeOf<"message">();
});
