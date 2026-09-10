import type { StandardJSONSchemaV1, StandardSchemaV1 } from "@standard-schema/spec";

/** A JSON value retained from a Standard JSON Schema converter. */
export type JsonValue = boolean | null | number | string | readonly JsonValue[] | JsonObject;

/** A JSON object retained from a Standard JSON Schema converter. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** A root JSON Schema object accepted by Standard JSON Schema v1 converters. */
export type JsonSchema = JsonObject;

/** Selects the validator representation used on the HTTP wire or in a response. */
export type SchemaMode = "input" | "output";

/** Converts a validator without native Standard JSON Schema support. */
export type SchemaConverter = (
  schema: StandardSchemaV1,
  mode: SchemaMode,
) => ReturnType<StandardJSONSchemaV1["~standard"]["jsonSchema"]["input"]>;

type ConvertedJsonSchema = ReturnType<StandardJSONSchemaV1["~standard"]["jsonSchema"]["input"]>;

declare const unparsedJsonObject: unique symbol;

interface UnparsedJsonObject {
  readonly [unparsedJsonObject]?: never;
}

function isJsonSchemaConverter(
  value: unknown,
): value is StandardJSONSchemaV1["~standard"]["jsonSchema"] {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "input" in value &&
    typeof value.input === "function" &&
    "output" in value &&
    typeof value.output === "function"
  );
}

function hasNativeJsonSchema(
  schema: StandardSchemaV1,
): schema is StandardSchemaV1 & StandardJSONSchemaV1 {
  const standard = schema["~standard"];
  return "jsonSchema" in standard && isJsonSchemaConverter(standard.jsonSchema);
}

/** Converts one validator shape to draft 2020-12 JSON Schema for REST and OpenAPI metadata. */
export function resolveJsonSchema(
  schema: StandardSchemaV1,
  mode: SchemaMode,
  path: string,
  converter?: SchemaConverter,
): JsonSchema {
  try {
    if (hasNativeJsonSchema(schema)) {
      return parseJsonSchema(
        schema["~standard"].jsonSchema[mode]({ target: "draft-2020-12" }),
        path,
      );
    }

    if (converter) {
      return parseJsonSchema(converter(schema, mode), path);
    }
  } catch (cause) {
    throw new TypeError(`Could not convert ${path} ${mode} schema to JSON Schema`, { cause });
  }

  throw new TypeError(`Could not convert ${path} ${mode} schema to JSON Schema: no converter`);
}

const maximumJsonDepth = 100;

function parseJsonSchema(value: ConvertedJsonSchema, path: string): JsonSchema {
  if (!isJsonObject(value)) {
    throw jsonSchemaError(path, "root must be an object");
  }
  return parseJsonObject(value, path, new WeakSet(), 0);
}

function parseJsonObject(
  value: UnparsedJsonObject,
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
): JsonObject {
  enterJsonContainer(value, path, ancestors, depth);
  const result: Record<string, JsonValue> = {};
  try {
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined ||
        !("value" in descriptor)
      ) {
        throw jsonSchemaError(path, `property '${key}' is not JSON data`);
      }
      const item: unknown = descriptor.value;
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: parseJsonValueAtDepth(item, path, ancestors, depth + 1),
        writable: true,
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

/** Parse untrusted JSON-compatible data for internal HTTP assembly. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This exported parser is the strict boundary for HTTP bodies and converter values.
export function parseJsonValue(value: unknown, path: string): JsonValue {
  return parseJsonValueAtDepth(value, path, new WeakSet(), 0);
}

/* oxlint-disable anti-slop/no-unknown-parameters -- Recursive descriptor values remain untrusted until this parser validates them. */
function parseJsonValueAtDepth(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
): JsonValue {
  if (isJsonLiteral(value)) return value;
  if (isNumber(value)) {
    if (Number.isFinite(value)) return value;
    throw jsonSchemaError(path, "non-finite number");
  }
  if (Array.isArray(value)) return parseJsonArray(value, path, ancestors, depth);
  if (isJsonObject(value)) return parseJsonObject(value, path, ancestors, depth);
  throw jsonSchemaError(path, "non-JSON value");
}
/* oxlint-enable anti-slop/no-unknown-parameters */

function parseJsonArray(
  value: readonly unknown[],
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
): readonly JsonValue[] {
  enterJsonContainer(value, path, ancestors, depth);
  try {
    if (Object.keys(value).length !== value.length) {
      throw jsonSchemaError(path, "array contains non-JSON properties");
    }

    const result: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor?.enumerable !== true ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined ||
        !("value" in descriptor)
      ) {
        throw jsonSchemaError(path, `array item ${index} is not JSON data`);
      }
      const item: unknown = descriptor.value;
      result.push(parseJsonValueAtDepth(item, path, ancestors, depth + 1));
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function enterJsonContainer(
  value: UnparsedJsonObject | readonly unknown[],
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
): void {
  if (depth >= maximumJsonDepth) {
    throw jsonSchemaError(path, "maximum nesting depth exceeded");
  }
  if (ancestors.has(value)) {
    throw jsonSchemaError(path, "cycle detected");
  }
  ancestors.add(value);
}

function isJsonLiteral(value: unknown): value is boolean | null | string {
  return value === null || typeof value === "boolean" || typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function isJsonObject<Value>(value: Value): value is Value & UnparsedJsonObject {
  if (!isObject(value) || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isObject<Value>(value: Value): value is Value & object {
  return value !== null && typeof value === "object";
}

function jsonSchemaError(path: string, detail: string): TypeError {
  return new TypeError(`Could not convert ${path} schema to JSON Schema: ${detail}`);
}
