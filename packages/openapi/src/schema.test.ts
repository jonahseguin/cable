import type { StandardJSONSchemaV1, StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonValue, type SchemaConverter, resolveJsonSchema } from "./schema.js";

const validationOnlySchema = {
  "~standard": {
    validate: () => ({ value: undefined }),
    vendor: "test",
    version: 1,
  },
} satisfies StandardSchemaV1;

const explicitConverter: SchemaConverter = (_schema, mode) =>
  mode === "input" ? { type: "string" } : { type: "number" };

describe("resolveJsonSchema", () => {
  it("uses a native converter with the draft 2020-12 target", () => {
    const schema = z.object({ postId: z.string() });

    expect(resolveJsonSchema(schema, "input", "posts.get.input")).toEqual(
      schema["~standard"].jsonSchema.input({ target: "draft-2020-12" }),
    );
  });

  it("keeps the input and output forms distinct for a native converter", () => {
    const schema = {
      "~standard": {
        jsonSchema: {
          input: ({ target }) => ({ target, type: "string" }),
          output: ({ target }) => ({ target, type: "number" }),
        },
        validate: () => ({ value: undefined }),
        vendor: "test",
        version: 1,
      },
    } satisfies StandardSchemaV1 & StandardJSONSchemaV1;

    expect(resolveJsonSchema(schema, "input", "posts.get.input")).toEqual({
      target: "draft-2020-12",
      type: "string",
    });
    expect(resolveJsonSchema(schema, "output", "posts.get.output")).toEqual({
      target: "draft-2020-12",
      type: "number",
    });
  });

  it("uses an explicit converter when a validator has no native converter", () => {
    expect(
      resolveJsonSchema(validationOnlySchema, "output", "posts.get.output", explicitConverter),
    ).toEqual({
      type: "number",
    });
  });

  it("reports the trusted contract path and preserves native conversion failures", () => {
    let error: unknown;

    try {
      resolveJsonSchema(z.string().transform(Number), "output", "posts.get.output");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(TypeError);
    if (!(error instanceof TypeError)) throw new Error("Expected conversion to throw TypeError");
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.message).toBe("Could not convert posts.get.output output schema to JSON Schema");
  });

  it("rejects a malformed root returned by a converter", () => {
    const schema = {
      "~standard": {
        validate: () => ({ value: undefined }),
        vendor: "test",
        version: 1,
      },
    } satisfies StandardSchemaV1;
    Object.defineProperty(schema["~standard"], "jsonSchema", {
      value: {
        input: () => null,
        output: () => null,
      },
    });

    expect(() => resolveJsonSchema(schema, "input", "posts.get.input")).toThrow(
      "Could not convert posts.get.input input schema to JSON Schema",
    );
  });
});

describe("parseJsonValue", () => {
  it("preserves null-prototype objects and keys with prototype names", () => {
    const value = {};
    Object.setPrototypeOf(value, null);
    Object.defineProperty(value, "__proto__", {
      enumerable: true,
      value: { default: false },
    });
    Object.defineProperties(value, {
      constructor: { enumerable: true, value: { examples: [0, "", null] } },
    });

    const parsed = parseJsonValue(value, "posts.get.output");

    expect(JSON.stringify(parsed)).toBe(
      '{"__proto__":{"default":false},"constructor":{"examples":[0,"",null]}}',
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects the non-finite number %s",
    (value) => {
      expect(() => parseJsonValue({ default: value }, "posts.get.output")).toThrow(
        "Could not convert posts.get.output schema to JSON Schema: non-finite number",
      );
    },
  );

  it("rejects cycles instead of overflowing the call stack", () => {
    interface CyclicValue {
      self?: CyclicValue;
    }
    const value: CyclicValue = {};
    value.self = value;

    expect(() => parseJsonValue(value, "posts.get.output")).toThrow(
      "Could not convert posts.get.output schema to JSON Schema: cycle",
    );
  });

  it("rejects values beyond the maximum nesting depth", () => {
    interface NestedValue {
      nested?: NestedValue;
    }
    const value: NestedValue = {};
    let cursor = value;
    for (let depth = 0; depth < 101; depth += 1) {
      const nested: NestedValue = {};
      cursor.nested = nested;
      cursor = nested;
    }

    expect(() => parseJsonValue(value, "posts.get.output")).toThrow(
      "Could not convert posts.get.output schema to JSON Schema: maximum nesting depth",
    );
  });

  it("rejects accessors without invoking them", () => {
    let reads = 0;
    const value = Object.defineProperty({}, "default", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "secret";
      },
    });

    expect(() => parseJsonValue(value, "posts.get.output")).toThrow(
      "Could not convert posts.get.output schema to JSON Schema: property 'default' is not JSON data",
    );
    expect(reads).toBe(0);
  });

  it.each([undefined, 1n, Symbol("value"), () => undefined, new Date(0)])(
    "rejects unsupported non-JSON data",
    (value) => {
      expect(() => parseJsonValue(value, "posts.get.output")).toThrow(
        "Could not convert posts.get.output schema to JSON Schema: non-JSON value",
      );
    },
  );
});
