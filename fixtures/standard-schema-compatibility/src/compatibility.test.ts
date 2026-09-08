import { c, type AnyStandardSchema, type InferInput, type InferOutput } from "@cablejs/contract";
import { encodeInput, implement, resolveChannel, validate } from "@cablejs/core";
import { type } from "arktype";
import { Schema } from "effect";
import * as v from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

const zodInput = z.string().transform(Number);
const valibotInput = v.pipe(v.string(), v.transform(Number));
const arkTypeInput = type("string").pipe(Number);
const effectInput = Schema.toStandardSchemaV1(Schema.NumberFromString);
const zodParams = z.object({ roomId: z.string() });
const valibotParams = v.object({ roomId: v.string() });
const arkTypeParams = type({ roomId: "string" });
const effectParams = Schema.toStandardSchemaV1(Schema.Struct({ roomId: Schema.String }));

interface SchemaCase {
  readonly input: AnyStandardSchema;
  readonly invalid: unknown;
  readonly name: string;
  readonly params: AnyStandardSchema;
}

const schemaCases: readonly SchemaCase[] = [
  { input: zodInput, invalid: null, name: "Zod", params: zodParams },
  { input: valibotInput, invalid: null, name: "Valibot", params: valibotParams },
  { input: arkTypeInput, invalid: null, name: "ArkType", params: arkTypeParams },
  { input: effectInput, invalid: null, name: "Effect Schema", params: effectParams },
];

describe("Standard Schema compatibility", () => {
  it("parses transformed procedure input from every validator", async () => {
    const zodProcedures = implement(
      c.contract({ convert: c.query({ input: zodInput, output: z.number() }) }),
    )
      .context<object>()
      .procedures({ convert: ({ input }) => input });
    const valibotProcedures = implement(
      c.contract({ convert: c.query({ input: valibotInput, output: z.number() }) }),
    )
      .context<object>()
      .procedures({ convert: ({ input }) => input });
    const arkTypeProcedures = implement(
      c.contract({ convert: c.query({ input: arkTypeInput, output: z.number() }) }),
    )
      .context<object>()
      .procedures({ convert: ({ input }) => input });
    const effectProcedures = implement(
      c.contract({ convert: c.query({ input: effectInput, output: z.number() }) }),
    )
      .context<object>()
      .procedures({ convert: ({ input }) => input });

    await expect(
      Promise.all(
        [zodProcedures, valibotProcedures, arkTypeProcedures, effectProcedures].map((procedures) =>
          procedures.execute({ id: "compat", input: "42", path: "convert" }, {}),
        ),
      ),
    ).resolves.toEqual([
      { data: 42, id: "compat", ok: true },
      { data: 42, id: "compat", ok: true },
      { data: 42, id: "compat", ok: true },
      { data: 42, id: "compat", ok: true },
    ]);
  });

  it.each(schemaCases)(
    "$name validates channel params and events",
    async ({ input, invalid, params }) => {
      const room = c.channel("rooms.{roomId}", {
        client: { send: input },
        params,
        server: { message: input },
      });

      await expect(validate(room.params, { roomId: "one" })).resolves.toEqual({ roomId: "one" });
      await expect(resolveChannel(room, { roomId: "one" })).resolves.toMatchObject({
        key: "rooms:one",
      });
      await expect(validate(room.server.message, "42")).resolves.toBe(42);
      await expect(validate(room.client.send.input, invalid)).rejects.toMatchObject({
        code: "VALIDATION",
      });
    },
  );

  it("keeps inference paired with each validator's input and output", () => {
    const zodApi = c.contract({ convert: c.query({ input: zodInput, output: z.number() }) });
    const valibotApi = c.contract({
      convert: c.query({ input: valibotInput, output: z.number() }),
    });
    const arkTypeApi = c.contract({
      convert: c.query({ input: arkTypeInput, output: z.number() }),
    });
    const effectApi = c.contract({
      convert: c.query({ input: effectInput, output: z.number() }),
    });

    expectTypeOf<InferInput<typeof zodApi.convert>>().toEqualTypeOf<string>();
    expectTypeOf<InferOutput<typeof zodApi.convert>>().toEqualTypeOf<number>();
    expectTypeOf<InferInput<typeof valibotApi.convert>>().toEqualTypeOf<string>();
    expectTypeOf<InferOutput<typeof valibotApi.convert>>().toEqualTypeOf<number>();
    expectTypeOf<InferInput<typeof arkTypeApi.convert>>().toEqualTypeOf<string>();
    expectTypeOf<InferOutput<typeof arkTypeApi.convert>>().toEqualTypeOf<number>();
    expectTypeOf<InferInput<typeof effectApi.convert>>().toEqualTypeOf<string>();
    expectTypeOf<InferOutput<typeof effectApi.convert>>().toEqualTypeOf<number>();
  });

  it("awaits asynchronous Standard Schema transforms from Zod and Valibot", async () => {
    const zodAsync = z.string().transform(async (value) => Number(value));
    const valibotAsync = v.pipeAsync(
      v.string(),
      v.transformAsync(async (value) => Number(value)),
    );

    await expect(validate(zodAsync, "7")).resolves.toBe(7);
    await expect(validate(valibotAsync, "8")).resolves.toBe(8);
  });

  it("keeps non-JSON values outside the transport boundary", () => {
    expect(() => encodeInput(Number.NaN)).toThrow("non-finite number");
  });
});
