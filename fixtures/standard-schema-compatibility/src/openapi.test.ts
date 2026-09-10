import { c } from "@cablejs/contract";
import { createOpenApiDocument, type SchemaConverter } from "@cablejs/openapi";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { type } from "arktype";
import { Schema } from "effect";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const valibotInput = v.pipe(v.string(), v.transform(Number));
const valibotOutput = v.object({ value: v.number() });
const effectInput = Schema.toStandardSchemaV1(Schema.NumberFromString);
const effectOutput = Schema.toStandardSchemaV1(Schema.Struct({ value: Schema.Number }));

const converter: SchemaConverter = (schema, mode) => {
  if (schema === valibotInput) {
    return toStandardJsonSchema(valibotInput)["~standard"].jsonSchema[mode]({
      target: "draft-2020-12",
    });
  }
  if (schema === valibotOutput) {
    return toStandardJsonSchema(valibotOutput)["~standard"].jsonSchema[mode]({
      target: "draft-2020-12",
    });
  }
  if (schema === effectInput) {
    return Schema.toStandardJSONSchemaV1(Schema.NumberFromString)["~standard"].jsonSchema[mode]({
      target: "draft-2020-12",
    });
  }
  if (schema === effectOutput) {
    return Schema.toStandardJSONSchemaV1(Schema.Struct({ value: Schema.Number }))[
      "~standard"
    ].jsonSchema[mode]({ target: "draft-2020-12" });
  }

  throw new TypeError("Unexpected schema converter input");
};

describe("OpenAPI Standard JSON Schema compatibility", () => {
  it("uses native Zod and ArkType schemas", () => {
    const contract = c.contract({
      arkType: c.mutation({
        http: { method: "POST", path: "/arktype" },
        input: type({ value: "string" }),
        output: type({ value: "number" }),
      }),
      zod: c.mutation({
        http: { method: "POST", path: "/zod" },
        input: z.object({ value: z.string() }),
        output: z.object({ value: z.number() }),
      }),
    });

    const document = createOpenApiDocument(contract, {
      info: { title: "Compatibility", version: "1" },
    });

    expect(document.paths["/zod"]?.post?.requestBody).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/zod-input" } } },
      required: true,
    });
    expect(document.components?.schemas?.["zod-input"]).toMatchObject({
      properties: { value: { type: "string" } },
    });
    expect(document.paths["/arktype"]?.post?.responses["200"]).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/arkType-output" } } },
    });
    expect(document.components?.schemas?.["arkType-output"]).toMatchObject({
      properties: { value: { type: "number" } },
    });
  });

  it("uses explicit Valibot and Effect converters for input and output", () => {
    const contract = c.contract({
      effect: c.mutation({
        http: { method: "POST", path: "/effect" },
        input: effectInput,
        output: effectOutput,
      }),
      valibot: c.mutation({
        http: { method: "POST", path: "/valibot" },
        input: valibotInput,
        output: valibotOutput,
      }),
    });

    const document = createOpenApiDocument(contract, {
      info: { title: "Compatibility", version: "1" },
      schema: converter,
    });

    expect(document.paths["/valibot"]?.post?.requestBody).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/valibot-input" } } },
    });
    expect(document.components?.schemas?.["valibot-input"]).toMatchObject({ type: "string" });
    expect(document.paths["/effect"]?.post?.responses["200"]).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/effect-output" } } },
    });
    expect(document.components?.schemas?.["effect-output"]).toBeDefined();
  });

  it("rejects a native converter that cannot represent a transform", () => {
    const contract = c.contract({
      transform: c.mutation({
        http: { method: "POST", path: "/transform" },
        input: z.string().transform(Number),
        output: z.string().transform(Number),
      }),
    });

    expect(() =>
      createOpenApiDocument(contract, { info: { title: "Compatibility", version: "1" } }),
    ).toThrow("transform output");
  });
});
