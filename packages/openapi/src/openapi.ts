import type { Contract, ContractTree, HttpSecurityRequirement } from "@cablejs/contract";
import { BUILTIN_CODES, statusForCode } from "@cablejs/core";

import { compileOperations, type CompiledOperation } from "./rest.js";
import type { JsonObject, JsonSchema, JsonValue, SchemaConverter } from "./schema.js";

export interface OpenApiInfo {
  readonly title: string;
  readonly version: string;
}

export type OpenApiSecurityScheme =
  | { readonly bearerFormat?: string; readonly scheme: string; readonly type: "http" }
  | {
      readonly description?: string;
      readonly in: "cookie" | "header" | "query";
      readonly name: string;
      readonly type: "apiKey";
    }
  | {
      readonly description?: string;
      readonly flows: JsonObject;
      readonly type: "oauth2";
    }
  | {
      readonly description?: string;
      readonly openIdConnectUrl: string;
      readonly type: "openIdConnect";
    };

export interface CreateOpenApiDocumentOptions {
  readonly info: OpenApiInfo;
  readonly schema?: SchemaConverter;
  readonly securitySchemes?: Readonly<Record<string, OpenApiSecurityScheme>>;
}

export interface OpenApiDocument {
  readonly components?: {
    readonly schemas?: Readonly<Record<string, JsonSchema>>;
    readonly securitySchemes?: Readonly<Record<string, OpenApiSecurityScheme>>;
  };
  readonly info: OpenApiInfo;
  readonly openapi: "3.1.2";
  readonly paths: Readonly<Record<string, OpenApiPathItem>>;
}

export interface OpenApiPathItem {
  readonly delete?: OpenApiOperation;
  readonly get?: OpenApiOperation;
  readonly patch?: OpenApiOperation;
  readonly post?: OpenApiOperation;
  readonly put?: OpenApiOperation;
}

export interface OpenApiOperation {
  readonly operationId?: string;
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: OpenApiRequestBody;
  readonly responses: Readonly<Record<string, OpenApiResponse>>;
  readonly security?: readonly HttpSecurityRequirement[];
  readonly summary?: string;
  readonly tags?: readonly string[];
}

export interface OpenApiParameter {
  readonly in: "path" | "query";
  readonly name: string;
  readonly required?: boolean;
  readonly schema: JsonSchema;
}

export interface OpenApiRequestBody {
  readonly content: { readonly "application/json": { readonly schema: JsonSchema } };
  readonly required: boolean;
}

export interface OpenApiResponse {
  readonly content: { readonly "application/json": { readonly schema: JsonSchema } };
  readonly description: string;
}

interface BodyDocumentation {
  readonly requestBody?: OpenApiRequestBody;
}

interface InputDocumentation {
  readonly properties: Readonly<Record<string, JsonSchema>>;
  readonly required: ReadonlySet<string>;
  readonly schema: JsonSchema;
}

interface MutableOpenApiOperation {
  operationId?: string;
  parameters?: readonly OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Readonly<Record<string, OpenApiResponse>>;
  security?: readonly HttpSecurityRequirement[];
  summary?: string;
  tags?: readonly string[];
}

interface MutableOpenApiComponents {
  schemas: Readonly<Record<string, JsonSchema>>;
  securitySchemes?: Readonly<Record<string, OpenApiSecurityScheme>>;
}

interface MutableOpenApiParameter {
  in: "query";
  name: string;
  required?: boolean;
  schema: JsonSchema;
}

interface MutableJsonSchema extends JsonObject {
  [key: string]: JsonValue;
}

interface OpenApiResponses {
  readonly [status: string]: OpenApiResponse;
}

/** Generate an OpenAPI 3.1.2 document for annotated global cable procedures. */
export function createOpenApiDocument<TTree extends ContractTree>(
  contract: Contract<TTree>,
  options: CreateOpenApiDocumentOptions,
): OpenApiDocument {
  const operations = compileOperations(contract, options.schema);
  assertSecurityRequirements(operations, options.securitySchemes);

  const paths: Record<string, OpenApiPathItem> = {};
  const schemas: Record<string, JsonSchema> = {};
  for (const operation of operations) {
    const pathItem = paths[operation.http.path] ?? {};
    Object.defineProperty(paths, operation.http.path, {
      configurable: true,
      enumerable: true,
      value: {
        ...pathItem,
        [operation.http.method.toLowerCase()]: openApiOperation(operation, schemas),
      },
      writable: true,
    });
  }

  const components: MutableOpenApiComponents = { schemas };
  if (options.securitySchemes !== undefined) components.securitySchemes = options.securitySchemes;
  return {
    components,
    info: options.info,
    openapi: "3.1.2",
    paths,
  };
}

function openApiOperation(
  operation: CompiledOperation,
  schemas: Record<string, JsonSchema>,
): OpenApiOperation {
  const responses = responsesFor(operation, schemas);
  const result: MutableOpenApiOperation = { responses };
  if (operation.http.operationId !== undefined) result.operationId = operation.http.operationId;
  if (operation.http.security !== undefined) result.security = operation.http.security;
  if (operation.http.summary !== undefined) result.summary = operation.http.summary;
  if (operation.http.tags !== undefined) result.tags = operation.http.tags;
  if (operation.http.method === "GET") {
    result.parameters = parametersFor(operation);
    return result;
  }
  const body = bodyFor(operation, schemas);
  if (body.requestBody !== undefined) result.requestBody = body.requestBody;
  if (operation.segments.some((segment) => segment.kind === "parameter")) {
    result.parameters = pathParameters(operation);
  }
  return result;
}

function parametersFor(operation: CompiledOperation): readonly OpenApiParameter[] {
  return [...pathParameters(operation), ...queryParameters(operation)];
}

function pathParameters(operation: CompiledOperation): readonly OpenApiParameter[] {
  const { properties } = inputObject(operation);
  return operation.segments.flatMap((segment) => {
    if (segment.kind !== "parameter") return [];
    const schema = properties[segment.value];
    if (schema === undefined)
      throw new TypeError(
        `OpenAPI input schema '${operation.path}' has no '${segment.value}' property`,
      );
    assertParameterSchema(schema, `${operation.path}.${segment.value}`);
    return [{ in: "path" as const, name: segment.value, required: true, schema }];
  });
}

function queryParameters(operation: CompiledOperation): readonly OpenApiParameter[] {
  const { properties, required } = inputObject(operation);
  const pathNames = new Set(
    operation.segments.flatMap((segment) => (segment.kind === "parameter" ? [segment.value] : [])),
  );
  return Object.entries(properties).flatMap(([name, schema]) => {
    if (pathNames.has(name)) return [];
    assertParameterSchema(schema, `${operation.path}.${name}`);
    const parameter: MutableOpenApiParameter = {
      in: "query",
      name,
      schema,
    };
    if (required.has(name)) parameter.required = true;
    return [parameter];
  });
}

function bodyFor(
  operation: CompiledOperation,
  schemas: Record<string, JsonSchema>,
): BodyDocumentation {
  const pathNames = new Set(
    operation.segments.flatMap((segment) => (segment.kind === "parameter" ? [segment.value] : [])),
  );
  if (pathNames.size === 0) {
    const required = isObjectInput(operation.inputSchema)
      ? inputObject(operation).required.size > 0
      : true;
    return {
      requestBody: {
        content: {
          "application/json": {
            schema: schemaReference(operation.inputSchema, `${operation.path}-input`, schemas),
          },
        },
        required,
      },
    };
  }
  const { properties, required, schema } = inputObject(operation);
  const bodyProperties = Object.fromEntries(
    Object.entries(properties).filter(([name]) => !pathNames.has(name)),
  );
  const bodyRequired = [...required].filter((name) => !pathNames.has(name));
  if (Object.keys(bodyProperties).length === 0 && schema["additionalProperties"] !== true)
    return {};
  const bodySchema: JsonSchema = {
    ...schema,
    properties: bodyProperties,
    ...(bodyRequired.length === 0 ? { required: [] } : { required: bodyRequired }),
  };
  const reference = schemaReference(bodySchema, `${operation.path}-input`, schemas);
  return {
    requestBody: {
      content: { "application/json": { schema: reference } },
      required: bodyRequired.length > 0,
    },
  };
}

function isObjectInput(schema: JsonSchema): boolean {
  return schema["type"] === "object" && isJsonObject(schema["properties"]);
}

function responsesFor(
  operation: CompiledOperation,
  schemas: Record<string, JsonSchema>,
): OpenApiResponses {
  const responses: Record<string, OpenApiResponse> = {};
  responses[String(operation.http.successStatus ?? 200)] = jsonResponse(
    "Success",
    schemaReference(operation.outputSchema, `${operation.path}-output`, schemas),
  );
  const codesByStatus = new Map<number, string[]>();
  for (const code of BUILTIN_CODES) {
    const status = statusForCode(code);
    const codes = codesByStatus.get(status) ?? [];
    codes.push(code);
    codesByStatus.set(status, codes);
  }
  for (const [status, codes] of codesByStatus) {
    responses[String(status)] = jsonResponse(
      "Cable error",
      errorEnvelope(builtinError(codes, status)),
    );
  }
  const errorSchemas = Object.entries(operation.errorSchemas);
  if (errorSchemas.length > 0) {
    responses["default"] = jsonResponse(
      "Declared application error",
      errorEnvelope({
        anyOf: errorSchemas.map(([code, schema]) => ({
          properties: {
            code: { const: code },
            data: schemaReference(schema, `${operation.path}-error-${code}`, schemas),
          },
          required: ["code", "data"],
          type: "object",
        })),
      }),
    );
  }
  return responses;
}

function errorEnvelope(error: JsonSchema): JsonSchema {
  return {
    properties: { error },
    required: ["error"],
    type: "object",
  };
}

function builtinError(codes: readonly string[], status: number): JsonSchema {
  return {
    properties: {
      code: { enum: codes, type: "string" },
      message: { type: "string" },
      status: { const: status, type: "integer" },
    },
    required: ["code", "status"],
    type: "object",
  };
}

function jsonResponse(description: string, schema: JsonSchema): OpenApiResponse {
  return { content: { "application/json": { schema } }, description };
}

function inputObject(operation: CompiledOperation): InputDocumentation {
  const schema = operation.inputSchema;
  if (schema["type"] !== "object" || !isJsonObject(schema["properties"])) {
    throw new TypeError(`OpenAPI input schema '${operation.path}' must be a local object schema`);
  }
  const properties: Record<string, JsonSchema> = {};
  for (const [name, value] of Object.entries(schema["properties"])) {
    if (!isJsonObject(value))
      throw new TypeError(
        `OpenAPI input schema '${operation.path}' has an invalid '${name}' property`,
      );
    Object.defineProperty(properties, name, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  }
  const required = new Set<string>();
  if (isJsonArray(schema["required"])) {
    for (const name of schema["required"]) {
      if (isJsonString(name)) required.add(name);
    }
  }
  return { properties, required, schema };
}

function assertParameterSchema(schema: JsonSchema, path: string): void {
  const type = schema["type"];
  if (type === "string" || type === "number" || type === "integer" || type === "boolean") return;
  if (type === "array" && isJsonObject(schema["items"])) {
    assertParameterSchema(schema["items"], path);
    return;
  }
  throw new TypeError(`OpenAPI parameter '${path}' has an unsupported schema shape`);
}

function schemaReference(
  schema: JsonSchema,
  name: string,
  schemas: Record<string, JsonSchema>,
): JsonSchema {
  const component = componentName(name, schemas);
  Object.defineProperty(schemas, component, {
    configurable: true,
    enumerable: true,
    value: rebaseSchema(schema, `#/components/schemas/${component}`),
    writable: true,
  });
  return { $ref: `#/components/schemas/${component}` };
}

function componentName(name: string, schemas: Readonly<Record<string, JsonSchema>>): string {
  const encoded = name.replace(
    /[^A-Za-z0-9-]/g,
    (character) => `_${character.charCodeAt(0).toString(16)}_`,
  );
  let candidate = encoded;
  let suffix = 2;
  while (Object.hasOwn(schemas, candidate)) {
    candidate = `${encoded}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function rebaseSchema(schema: JsonSchema, root: string): JsonSchema {
  assertRebasableSchema(schema);
  const result: MutableJsonSchema = { ...schema };
  rebaseReference(result, schema, root);
  rebaseObjectSchemaChildren(result, schema, root);
  rebaseSingleSchemaChildren(result, schema, root);
  rebaseArraySchemaChildren(result, schema, root);
  return result;
}

function assertRebasableSchema(schema: JsonSchema): void {
  for (const key of ["$id", "$anchor", "$dynamicAnchor", "$dynamicRef", "$recursiveRef"]) {
    if (schema[key] !== undefined) throw new TypeError(`OpenAPI schema uses unsupported '${key}'`);
  }
}

function rebaseReference(result: MutableJsonSchema, schema: JsonSchema, root: string): void {
  const ref = schema["$ref"];
  if (ref === undefined) return;
  if (!isJsonString(ref) || (ref !== "#" && !ref.startsWith("#/"))) {
    throw new TypeError("OpenAPI schema uses an unsupported reference");
  }
  result["$ref"] = `${root}${ref.slice(1)}`;
}

function rebaseObjectSchemaChildren(
  result: MutableJsonSchema,
  schema: JsonSchema,
  root: string,
): void {
  for (const key of ["$defs", "properties", "patternProperties", "dependentSchemas"]) {
    if (!isJsonObject(schema[key])) continue;
    result[key] = Object.fromEntries(
      Object.entries(schema[key]).map(([name, value]) => [
        name,
        isJsonObject(value) ? rebaseSchema(value, root) : value,
      ]),
    );
  }
}

function rebaseSingleSchemaChildren(
  result: MutableJsonSchema,
  schema: JsonSchema,
  root: string,
): void {
  for (const key of [
    "additionalProperties",
    "contains",
    "contentSchema",
    "if",
    "items",
    "not",
    "propertyNames",
    "then",
    "unevaluatedProperties",
    "unevaluatedItems",
    "else",
  ]) {
    if (isJsonObject(schema[key])) result[key] = rebaseSchema(schema[key], root);
  }
}

function rebaseArraySchemaChildren(
  result: MutableJsonSchema,
  schema: JsonSchema,
  root: string,
): void {
  for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
    if (!isJsonArray(schema[key])) continue;
    result[key] = schema[key].map((value) =>
      isJsonObject(value) ? rebaseSchema(value, root) : value,
    );
  }
}

function assertSecurityRequirements(
  operations: readonly CompiledOperation[],
  securitySchemes: Readonly<Record<string, OpenApiSecurityScheme>> | undefined,
): void {
  for (const operation of operations) {
    for (const requirement of operation.http.security ?? []) {
      for (const name of Object.keys(requirement)) {
        if (securitySchemes === undefined || !Object.hasOwn(securitySchemes, name)) {
          throw new TypeError(
            `OpenAPI security requirement '${name}' has no supplied security scheme`,
          );
        }
      }
    }
  }
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isJsonString(value: JsonValue | undefined): value is string {
  return typeof value === "string";
}
