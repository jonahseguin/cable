import {
  isChannelContract,
  isProcedureContract,
  type AnyProcedureContract,
  type Contract,
  type ContractTree,
  type HttpProcedureOptions,
} from "@cablejs/contract";
import {
  isCableError,
  readRequestBody,
  type EdgeHttpPolicy,
  type EdgeHttpMount,
  type ImplementedProcedures,
  type RpcResult,
  type WireError,
} from "@cablejs/core";

import {
  parseJsonValue,
  resolveJsonSchema,
  type JsonObject,
  type JsonSchema,
  type JsonValue,
  type SchemaConverter,
} from "./schema.js";

interface RouteSegment {
  readonly kind: "parameter" | "static";
  readonly value: string;
}

interface InputProperties {
  readonly [name: string]: JsonSchema;
}

export interface CompiledOperation {
  readonly errorSchemas: Readonly<Record<string, JsonSchema>>;
  readonly http: HttpProcedureOptions;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
  readonly path: string;
  readonly procedure: AnyProcedureContract;
  readonly segments: readonly RouteSegment[];
}

export interface RestHandlerOptions {
  readonly schema?: SchemaConverter;
}

/** Compile annotated global procedures into an adapter-neutral HTTP mount. */
export function createRestHandler<TTree extends ContractTree, TContext extends object>(
  contract: Contract<TTree>,
  procedures: ImplementedProcedures<TTree, TContext>,
  options: RestHandlerOptions = {},
): EdgeHttpMount<TContext> {
  const operations = compileOperations(contract, options.schema);
  return {
    matches(request): boolean {
      return operations.some((operation) =>
        matchSegments(operation.segments, requestUrl(request).pathname),
      );
    },
    async fetch(request, context, policy): Promise<Response> {
      const url = requestUrl(request);
      const pathOperations = selectPathOperations(operations, url.pathname);
      const operation = pathOperations.find(
        (candidate) => candidate.http.method === request.method,
      );
      if (operation === undefined) {
        return new Response("Method not allowed", {
          headers: { allow: allowedMethods(pathOperations) },
          status: 405,
        });
      }
      try {
        const input = await requestInput(operation, request, url, policy);
        const result = await procedures.execute(
          { id: "rest", input, path: operation.path },
          context,
          request.signal,
          "rest",
        );
        return restResult(result, operation.http.successStatus ?? 200);
      } catch (error) {
        return badRequest(isCableError(error, "PAYLOAD_TOO_LARGE"));
      }
    },
  };
}

export function compileOperations<TTree extends ContractTree>(
  contract: Contract<TTree>,
  converter: SchemaConverter | undefined,
): readonly CompiledOperation[] {
  const operations: CompiledOperation[] = [];
  collectOperations(contract, [], converter, operations);
  assertOperationConflicts(operations);
  return Object.freeze(operations.toSorted(compareRouteSpecificity));
}

function collectOperations(
  tree: ContractTree,
  path: readonly string[],
  converter: SchemaConverter | undefined,
  operations: CompiledOperation[],
): void {
  for (const [name, node] of Object.entries(tree)) {
    const nextPath = [...path, name];
    if (isChannelContract(node)) continue;
    if (isProcedureContract(node)) {
      if (node.http === undefined) continue;
      const procedurePath = nextPath.join(".");
      const inputSchema = resolveJsonSchema(node.input, "input", procedurePath, converter);
      const outputSchema = resolveJsonSchema(node.output, "output", procedurePath, converter);
      const errorSchemas: Record<string, JsonSchema> = {};
      for (const [code, schema] of Object.entries(node.errors)) {
        defineOwn(
          errorSchemas,
          code,
          resolveJsonSchema(schema, "output", `${procedurePath}.errors.${code}`, converter),
        );
      }
      const segments = parseRoute(node.http.path, procedurePath);
      assertRouteInput(inputSchema, node.http.method, segments, procedurePath);
      operations.push({
        errorSchemas: Object.freeze(errorSchemas),
        http: node.http,
        inputSchema,
        outputSchema,
        path: procedurePath,
        procedure: node,
        segments,
      });
      continue;
    }
    // SAFETY: `c.contract` validates that every non-node branch is a contract tree.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The contract brand establishes this recursive branch invariant.
    collectOperations(node as ContractTree, nextPath, converter, operations);
  }
}

function assertOperationConflicts(operations: readonly CompiledOperation[]): void {
  const operationIds = new Set<string>();
  for (const operation of operations) {
    const operationId = operation.http.operationId;
    if (operationId !== undefined) {
      if (operationIds.has(operationId))
        throw new TypeError(`Duplicate HTTP operationId '${operationId}'`);
      operationIds.add(operationId);
    }
    for (const candidate of operations) {
      if (candidate === operation || candidate.http.method !== operation.http.method) continue;
      if (sameTemplate(candidate.segments, operation.segments)) {
        throw new TypeError(
          `Conflicting HTTP route '${operation.http.method} ${operation.http.path}'`,
        );
      }
    }
  }
}

function requestUrl(request: Request): URL {
  return new URL(request.url);
}

function selectPathOperations(
  operations: readonly CompiledOperation[],
  pathname: string,
): readonly CompiledOperation[] {
  const first = operations.find((operation) => matchSegments(operation.segments, pathname));
  if (first === undefined) return [];
  return operations.filter(
    (operation) =>
      matchSegments(operation.segments, pathname) &&
      compareRouteSpecificity(operation, first) === 0,
  );
}

function allowedMethods(operations: readonly CompiledOperation[]): string {
  return operations.map((operation) => operation.http.method).join(", ");
}

function parseRoute(path: string, label: string): readonly RouteSegment[] {
  const segments = path
    .slice(1)
    .split("/")
    .map((segment) => {
      const parameter = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(segment);
      if (parameter !== null) {
        const value = parameter[1];
        if (value === undefined) throw new TypeError(`Invalid HTTP route '${label}'`);
        return { kind: "parameter" as const, value };
      }
      return { kind: "static" as const, value: segment };
    });
  const parameters = new Set<string>();
  for (const segment of segments) {
    if (segment.kind !== "parameter") continue;
    if (parameters.has(segment.value)) {
      throw new TypeError(`HTTP route '${label}' repeats placeholder '${segment.value}'`);
    }
    parameters.add(segment.value);
  }
  return Object.freeze(segments);
}

function matchSegments(segments: readonly RouteSegment[], pathname: string): boolean {
  const values = pathname.slice(1).split("/");
  if (values.length !== segments.length) return false;
  return segments.every((segment, index) =>
    segment.kind === "parameter"
      ? values[index] !== undefined && values[index].length > 0
      : values[index] === segment.value,
  );
}

function sameTemplate(left: readonly RouteSegment[], right: readonly RouteSegment[]): boolean {
  return (
    left.length === right.length &&
    left.every((segment, index) => {
      const candidate = right[index];
      if (candidate === undefined) return false;
      if (segment.kind !== candidate.kind) return false;
      return segment.kind === "parameter" || segment.value === candidate.value;
    })
  );
}

function compareRouteSpecificity(left: CompiledOperation, right: CompiledOperation): number {
  for (const [index, segment] of left.segments.entries()) {
    const candidate = right.segments[index];
    if (candidate === undefined || segment.kind === candidate.kind) continue;
    return segment.kind === "static" ? -1 : 1;
  }
  return 0;
}

function assertRouteInput(
  schema: JsonSchema,
  method: string,
  segments: readonly RouteSegment[],
  path: string,
): void {
  if (method !== "GET" && segments.every((segment) => segment.kind !== "parameter")) return;
  assertNoProjectedInputConstraints(schema, path);
  const properties = schemaProperties(schema, path);
  for (const segment of segments) {
    if (segment.kind === "parameter" && !Object.hasOwn(properties, segment.value)) {
      throw new TypeError(
        `HTTP route '${path}' placeholder '${segment.value}' is not an input property`,
      );
    }
    if (segment.kind === "parameter") {
      assertPathSchema(properties[segment.value], `${path}.${segment.value}`);
    }
  }
  if (method === "GET") {
    for (const [name, property] of Object.entries(properties)) {
      assertQuerySchema(property, `${path}.${name}`);
    }
  }
}

function assertPathSchema(schema: JsonSchema | undefined, path: string): void {
  if (
    schema?.["type"] === "string" ||
    schema?.["type"] === "number" ||
    schema?.["type"] === "integer" ||
    schema?.["type"] === "boolean"
  ) {
    return;
  }
  throw new TypeError(`HTTP path parameter '${path}' has an unsupported schema shape`);
}

function assertNoProjectedInputConstraints(schema: JsonSchema, path: string): void {
  for (const keyword of [
    "allOf",
    "dependentRequired",
    "dependentSchemas",
    "else",
    "if",
    "maxProperties",
    "minProperties",
    "not",
    "patternProperties",
    "then",
    "unevaluatedProperties",
  ]) {
    if (schema[keyword] !== undefined) {
      throw new TypeError(
        `HTTP input schema for '${path}' has unsupported cross-field constraints`,
      );
    }
  }
}

async function requestInput(
  operation: CompiledOperation,
  request: Request,
  url: URL,
  policy: EdgeHttpPolicy,
): Promise<JsonValue> {
  if (!requiresObjectInput(operation)) return scalarRequestInput(request, url, policy);
  const properties = schemaProperties(operation.inputSchema, operation.path);
  const input = pathInput(operation, url.pathname, properties);
  appendQueryInput(input, operation, url.searchParams, properties);
  if (operation.http.method !== "GET") await appendBodyInput(input, request, policy);
  return input;
}

function requiresObjectInput(operation: CompiledOperation): boolean {
  return (
    operation.http.method === "GET" ||
    operation.segments.some((segment) => segment.kind === "parameter") ||
    isObjectSchema(operation.inputSchema)
  );
}

async function scalarRequestInput(
  request: Request,
  url: URL,
  policy: EdgeHttpPolicy,
): Promise<JsonValue> {
  if (url.search.length > 0)
    throw new TypeError("HTTP scalar body input cannot use query parameters");
  return parseRequestBody(request, policy);
}

function pathInput(operation: CompiledOperation, pathname: string, properties: InputProperties) {
  const input: Record<string, JsonValue> = {};
  const values = pathname.slice(1).split("/");
  for (const [index, segment] of operation.segments.entries()) {
    if (segment.kind !== "parameter") continue;
    const raw = values[index];
    if (raw === undefined) throw new TypeError("Missing HTTP path parameter");
    defineOwn(
      input,
      segment.value,
      decodeValue(decodeURIComponent(raw), propertyFor(properties, segment.value), operation.path),
    );
  }
  return input;
}

function propertyFor(properties: InputProperties, key: string): JsonSchema | undefined {
  return Object.hasOwn(properties, key) ? properties[key] : undefined;
}

function appendQueryInput(
  input: Record<string, JsonValue>,
  operation: CompiledOperation,
  search: URLSearchParams,
  properties: InputProperties,
): void {
  for (const [key, value] of firstQueryValues(search)) {
    if (Object.hasOwn(input, key)) throw new TypeError(`HTTP input '${key}' is supplied twice`);
    const values = search.getAll(key);
    if (operation.http.method === "GET") {
      defineOwn(
        input,
        key,
        decodeQueryValues(values, propertyFor(properties, key), operation.path),
      );
    } else if (propertyFor(properties, key) !== undefined) {
      throw new TypeError(`HTTP input '${key}' must be supplied in the JSON body`);
    } else {
      defineOwn(input, key, values.length === 1 ? value : [...values]);
    }
  }
}

async function appendBodyInput(
  input: Record<string, JsonValue>,
  request: Request,
  policy: EdgeHttpPolicy,
): Promise<void> {
  if (request.body === null) return;
  const body = await parseRequestBody(request, policy);
  if (!isJsonObject(body)) throw new TypeError("HTTP JSON body must be an object");
  for (const [key, value] of Object.entries(body)) {
    if (Object.hasOwn(input, key)) throw new TypeError(`HTTP input '${key}' is supplied twice`);
    defineOwn(input, key, value);
  }
}

async function parseRequestBody(request: Request, policy: EdgeHttpPolicy): Promise<JsonValue> {
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    throw new TypeError("HTTP body must use application/json");
  }
  return parseJsonBody(await readRequestBody(request, policy.maxBodyBytes));
}

function* firstQueryValues(values: URLSearchParams): IterableIterator<readonly [string, string]> {
  const seen = new Set<string>();
  for (const [key, value] of values) {
    if (seen.has(key)) continue;
    seen.add(key);
    yield [key, value];
  }
}

function parseJsonBody(text: string): JsonValue {
  try {
    const parsed: unknown = JSON.parse(text);
    return parseJsonValue(parsed, "HTTP JSON body");
  } catch (cause) {
    throw new TypeError("HTTP JSON body is invalid", { cause });
  }
}

function schemaProperties(schema: JsonSchema, path: string): InputProperties {
  if (
    schema["$ref"] !== undefined ||
    schema["anyOf"] !== undefined ||
    schema["oneOf"] !== undefined
  ) {
    throw new TypeError(`HTTP input schema for '${path}' uses unsupported references or unions`);
  }
  if (schema["type"] !== "object" || !isJsonObject(schema["properties"])) {
    throw new TypeError(`HTTP input schema for '${path}' must be a local object schema`);
  }
  const properties: Record<string, JsonSchema> = {};
  for (const [key, value] of Object.entries(schema["properties"])) {
    if (!isJsonObject(value))
      throw new TypeError(`HTTP input schema for '${path}' has an invalid property`);
    defineOwn(properties, key, value);
  }
  return properties;
}

function isObjectSchema(schema: JsonSchema): boolean {
  return schema["type"] === "object" && isJsonObject(schema["properties"]);
}

function decodeQueryValues(
  values: readonly string[],
  schema: JsonSchema | undefined,
  path: string,
): JsonValue {
  if (schema === undefined) {
    if (values.length !== 1) return [...values];
    const value = values[0];
    if (value === undefined) throw new TypeError("HTTP query parameter is missing");
    return value;
  }
  if (schema["type"] === "array") {
    const items = schema["items"];
    if (!isJsonObject(items))
      throw new TypeError(`HTTP input schema for '${path}' has unsupported array items`);
    return values.map((value) => decodeValue(value, items, path));
  }
  if (values.length !== 1) throw new TypeError("HTTP scalar query parameter must not repeat");
  const value = values[0];
  if (value === undefined) throw new TypeError("HTTP query parameter is missing");
  return decodeValue(value, schema, path);
}

function decodeValue(value: string, schema: JsonSchema | undefined, path: string): JsonValue {
  if (schema === undefined || schema["type"] === "string") return value;
  if (schema["type"] === "number" || schema["type"] === "integer") {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
      throw new TypeError("HTTP number parameter is invalid");
    }
    const number = Number(value);
    if (!Number.isFinite(number) || (schema["type"] === "integer" && !Number.isInteger(number))) {
      throw new TypeError("HTTP number parameter is invalid");
    }
    return number;
  }
  if (schema["type"] === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new TypeError("HTTP boolean parameter is invalid");
  }
  throw new TypeError(`HTTP input schema for '${path}' has an unsupported parameter shape`);
}

function assertQuerySchema(schema: JsonSchema, path: string): void {
  if (schema["type"] === "array") {
    const items = schema["items"];
    if (isJsonObject(items)) {
      assertQuerySchema(items, path);
      return;
    }
  }
  if (
    schema["type"] === "string" ||
    schema["type"] === "number" ||
    schema["type"] === "integer" ||
    schema["type"] === "boolean"
  ) {
    return;
  }
  throw new TypeError(`HTTP input schema for '${path}' has an unsupported query parameter shape`);
}

function restResult(result: RpcResult, status: number): Response {
  if (result.ok) return jsonResponse(result.data, status);
  return jsonResponse({ error: result.error }, result.error.status);
}

function badRequest(payloadTooLarge: boolean): Response {
  const error: WireError = payloadTooLarge
    ? { code: "PAYLOAD_TOO_LARGE", message: "Payload too large", status: 413 }
    : { code: "BAD_REQUEST", message: "Bad request", status: 400 };
  return jsonResponse(parseJsonValue({ error }, "REST error"), error.status);
}

// SAFETY: This receives only `RpcRuntime.execute` data or a WireError envelope; both passed core's JSON boundary validation.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- The runtime retains the JSON type evidence internally while this transport preserves its serialization semantics.
function jsonResponse(value: unknown, status: number): Response {
  // SAFETY: Core allows an undefined root value, for which JSON.stringify returns undefined at runtime.
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- The TypeScript declaration omits JSON.stringify's undefined result for an undefined root value.
  const body = JSON.stringify(value) ?? "null";
  return new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function defineOwn<TValue>(target: Record<string, TValue>, key: string, value: TValue): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}
