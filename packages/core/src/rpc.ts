/* oxlint-disable anti-slop/no-object-parameters, anti-slop/no-runtime-typeof,
anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- This codec is
the RPC trust boundary. Every unknown value is checked before domain use. */
import { CableError, isCableError } from "./errors.js";

/** A single procedure invocation on the portable RPC transport. */
export interface RpcCall {
  readonly id: string;
  readonly input: unknown;
  readonly path: string;
  /** Transport-local cancellation metadata; never encoded into JSON. */
  readonly signal?: AbortSignal;
}

/** An error safe to serialize across the RPC transport. */
export interface WireError {
  readonly code: string;
  readonly data?: unknown;
  readonly message?: string;
  readonly status: number;
}

/** A successful RPC call. Void output is normalized to `data: undefined`. */
export interface RpcSuccess {
  readonly data: unknown;
  readonly id: string;
  readonly ok: true;
}

/** A failed RPC call whose error is safe to send to a caller. */
export interface RpcFailure {
  readonly error: WireError;
  readonly id: string;
  readonly ok: false;
}

/** The independent success or failure of one RPC call. */
export type RpcResult = RpcFailure | RpcSuccess;

/** A request containing calls that may execute independently. */
export interface RpcBatch {
  readonly calls: readonly RpcCall[];
}

/** An ordered result for every call in an RPC batch. */
export interface RpcBatchResponse {
  readonly results: readonly RpcResult[];
}

/** The procedure runtime consumed by HTTP and in-memory transports. */
export interface RpcRuntime<TContext extends object> {
  execute(call: RpcCall, context: TContext, signal?: AbortSignal): Promise<RpcResult>;
  transport(path: string): { readonly cache?: string; readonly method: "GET" } | undefined;
}

/** Options for binding a procedure runtime to web-standard requests. */
export interface RpcHandlerOptions<TContext extends object> {
  /** RPC URL prefix. Defaults to `/_cable`. */
  readonly basePath?: string;
  /** Build the application context for one HTTP request. */
  readonly context: (request: Request) => Promise<TContext> | TContext;
  /** Maximum calls accepted in one POST. Defaults to 100. */
  readonly maxBatchSize?: number;
  /** Maximum UTF-8 request bytes accepted before parsing. Defaults to 1 MiB. */
  readonly maxBodyBytes?: number;
}

/** A web-standard HTTP handler for batched and cacheable procedure calls. */
export interface RpcHandler {
  fetch(request: Request): Promise<Response>;
}

interface MutableWireError {
  code: string;
  data?: unknown;
  message?: string;
  status: number;
}

interface WireErrorEnvelope {
  readonly error: WireError;
}

type EncodableRpcValue = RpcBatch | RpcBatchResponse | RpcResult | WireErrorEnvelope;

/** Encode a trusted batch request as JSON. */
export function encodeBatch(batch: RpcBatch): string {
  for (const call of batch.calls) {
    assertJsonData(call.input, "BAD_REQUEST");
  }
  return encodeJson({
    calls: batch.calls.map(({ id, input, path }) => ({ id, input, path })),
  });
}

/** Encode one GET input, or omit the query parameter for void input. */
export function encodeInput(input: RpcCall["input"]): string | undefined {
  assertJsonData(input, "BAD_REQUEST");
  if (input === undefined) {
    return undefined;
  }
  return JSON.stringify(input);
}

/** Parse and validate an untrusted JSON batch request. */
export function decodeBatch(text: string): RpcBatch {
  const parsed: unknown = parseJson(text);
  if (!isObject(parsed)) {
    throw new CableError("BAD_REQUEST", { message: "RPC batch must be an object" });
  }

  // SAFETY: The object check above permits reading the expected wire property.
  const candidate = parsed as { readonly calls?: unknown };
  if (!Array.isArray(candidate.calls)) {
    throw new CableError("BAD_REQUEST", { message: "RPC batch calls must be an array" });
  }

  const calls = candidate.calls.map(parseCall);
  assertUniqueIds(calls, "RPC batch", "BAD_REQUEST");
  return { calls };
}

/** Encode trusted ordered RPC results as JSON. */
export function encodeBatchResponse(response: RpcBatchResponse): string {
  for (const result of response.results) {
    if (result.ok) {
      assertJsonData(result.data, "INTERNAL");
    } else if (result.error.data !== undefined) {
      assertJsonData(result.error.data, "INTERNAL");
    }
  }
  return encodeJson(response);
}

/** Parse and validate an untrusted JSON batch response. */
export function decodeBatchResponse(text: string): RpcBatchResponse {
  const parsed: unknown = parseJson(text);
  if (!isObject(parsed)) {
    throw new CableError("PARSE_ERROR", { message: "RPC response must be an object" });
  }

  // SAFETY: The object check above permits reading the expected wire property.
  const candidate = parsed as { readonly results?: unknown };
  if (!Array.isArray(candidate.results)) {
    throw new CableError("PARSE_ERROR", { message: "RPC response results must be an array" });
  }

  const results = candidate.results.map(parseResult);
  assertUniqueIds(results, "RPC response", "PARSE_ERROR");
  return { results };
}

/** Parse and validate one untrusted JSON RPC result, as used by GET transport. */
export function decodeResult(text: string): RpcResult {
  return parseResult(parseJson(text), 0);
}

/** Reject values that JSON would silently transform or discard. */
export function assertJsonData(
  value: unknown,
  code: "BAD_REQUEST" | "INTERNAL" = "BAD_REQUEST",
): void {
  assertJsonValue(value, code, "root", new WeakSet(), 0);
}

/** Bind a procedure runtime to POST batches and opt-in GET procedures. */
export function createRpcHandler<TContext extends object>(
  runtime: RpcRuntime<TContext>,
  options: RpcHandlerOptions<TContext>,
): RpcHandler {
  const basePath = normalizeBasePath(options.basePath ?? "/_cable");
  const maxBatchSize = positiveInteger(options.maxBatchSize ?? 100, "maxBatchSize");
  const maxBodyBytes = positiveInteger(options.maxBodyBytes ?? 1_048_576, "maxBodyBytes");
  const rpcPath = `${basePath}/rpc`;

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === rpcPath) {
        return handlePost(runtime, options.context, request, maxBatchSize, maxBodyBytes);
      }

      const getPrefix = `${rpcPath}/`;
      if (request.method === "GET" && url.pathname.startsWith(getPrefix)) {
        return handleGet(runtime, options.context, request, url, getPrefix, maxBodyBytes);
      }

      return new Response("Not found", { status: 404 });
    },
  };
}

async function handlePost<TContext extends object>(
  runtime: RpcRuntime<TContext>,
  createContext: RpcHandlerOptions<TContext>["context"],
  request: Request,
  maxBatchSize: number,
  maxBodyBytes: number,
): Promise<Response> {
  try {
    const batch = decodeBatch(await readRequestBody(request, maxBodyBytes));
    if (batch.calls.length > maxBatchSize) {
      throw new CableError("PAYLOAD_TOO_LARGE", {
        message: `RPC batch exceeds ${maxBatchSize} calls`,
      });
    }
    const context = await createContext(request);
    const results = await Promise.all(
      batch.calls.map((call) => executeIndependently(runtime, call, context, request.signal)),
    );
    return jsonResponse(encodeBatchResponse({ results }), 200);
  } catch (error) {
    return fatalResponse(error);
  }
}

async function handleGet<TContext extends object>(
  runtime: RpcRuntime<TContext>,
  createContext: RpcHandlerOptions<TContext>["context"],
  request: Request,
  url: URL,
  getPrefix: string,
  maxBodyBytes: number,
): Promise<Response> {
  try {
    const path = decodeProcedurePath(url.pathname.slice(getPrefix.length));
    const transport = runtime.transport(path);
    if (transport === undefined) {
      return jsonResponse(
        encodeWireError({
          code: "NOT_FOUND",
          message: "Procedure does not allow GET",
          status: 404,
        }),
        404,
      );
    }

    const input = decodeGetInput(url.searchParams.get("input"), maxBodyBytes);
    const context = await createContext(request);
    const result = await runtime.execute({ id: "get", input, path }, context, request.signal);
    return getResultResponse(normalizeRuntimeResult(result, "get"), transport.cache);
  } catch (error) {
    return fatalResponse(error);
  }
}

function getResultResponse(result: RpcResult, cache: string | undefined): Response {
  const status = result.ok ? 200 : result.error.status;
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (result.ok && cache !== undefined) {
    headers.set("cache-control", cache);
  } else if (!result.ok) {
    headers.set("cache-control", "no-store");
  }
  return new Response(encodeJson(result), { headers, status });
}

async function executeIndependently<TContext extends object>(
  runtime: RpcRuntime<TContext>,
  call: RpcCall,
  context: TContext,
  signal?: AbortSignal,
): Promise<RpcResult> {
  try {
    const result = await runtime.execute(call, context, signal);
    return normalizeRuntimeResult(result, call.id);
  } catch {
    return internalResult(call.id);
  }
}

function normalizeRuntimeResult(result: RpcResult, expectedId: string): RpcResult {
  try {
    if (result.id !== expectedId) {
      return internalResult(expectedId);
    }
    if (result.ok) {
      assertJsonData(result.data, "INTERNAL");
    } else {
      if (result.error.code === "INTERNAL" || !isHttpStatus(result.error.status)) {
        return internalResult(expectedId);
      }
      if (result.error.data !== undefined) {
        assertJsonData(result.error.data, "INTERNAL");
      }
    }
    return result;
  } catch {
    return internalResult(expectedId);
  }
}

function internalResult(id: string): RpcResult {
  return {
    error: { code: "INTERNAL", message: "Internal server error", status: 500 },
    id,
    ok: false,
  };
}

function parseCall(value: unknown, index: number): RpcCall {
  if (!isObject(value)) {
    throw new CableError("BAD_REQUEST", { message: `RPC call ${index} must be an object` });
  }

  // SAFETY: The object check above permits reading known wire properties.
  const candidate = value as {
    readonly id?: unknown;
    readonly input?: unknown;
    readonly path?: unknown;
  };
  if (!isNonEmptyString(candidate.id) || !isNonEmptyString(candidate.path)) {
    throw new CableError("BAD_REQUEST", {
      message: `RPC call ${index} requires non-empty id and path strings`,
    });
  }
  return { id: candidate.id, input: candidate.input, path: candidate.path };
}

function parseResult(value: unknown, index: number): RpcResult {
  if (!isObject(value)) {
    throw new CableError("PARSE_ERROR", { message: `RPC result ${index} must be an object` });
  }

  // SAFETY: The object check above permits reading known wire properties.
  const candidate = value as {
    readonly data?: unknown;
    readonly error?: unknown;
    readonly id?: unknown;
    readonly ok?: unknown;
  };
  if (!isNonEmptyString(candidate.id)) {
    throw new CableError("PARSE_ERROR", { message: `RPC result ${index} requires an id` });
  }
  if (candidate.ok === true) {
    return { data: candidate.data, id: candidate.id, ok: true };
  }
  if (candidate.ok === false) {
    return { error: parseWireError(candidate.error, index), id: candidate.id, ok: false };
  }
  throw new CableError("PARSE_ERROR", { message: `RPC result ${index} requires boolean ok` });
}

function parseWireError(value: unknown, index: number): WireError {
  if (!isObject(value)) {
    throw new CableError("PARSE_ERROR", { message: `RPC result ${index} requires an error` });
  }

  // SAFETY: The object check above permits reading known wire properties.
  const candidate = value as {
    readonly code?: unknown;
    readonly data?: unknown;
    readonly message?: unknown;
    readonly status?: unknown;
  };
  if (!isNonEmptyString(candidate.code) || !isHttpStatus(candidate.status)) {
    throw new CableError("PARSE_ERROR", {
      message: `RPC result ${index} has an invalid error code or status`,
    });
  }
  if (candidate.message !== undefined && typeof candidate.message !== "string") {
    throw new CableError("PARSE_ERROR", { message: `RPC result ${index} has an invalid message` });
  }

  const error: MutableWireError = {
    code: candidate.code,
    status: candidate.status,
  };
  if (candidate.message !== undefined) {
    error.message = candidate.message;
  }
  if (candidate.data !== undefined) {
    error.data = candidate.data;
  }
  return error;
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (cause) {
    throw new CableError("PARSE_ERROR", { cause, message: "Invalid JSON" });
  }
}

function encodeJson(value: EncodableRpcValue): string {
  try {
    const encoded = JSON.stringify(value);
    return encoded;
  } catch (cause) {
    if (isCableError(cause)) {
      throw cause;
    }
    throw new CableError("BAD_REQUEST", {
      cause,
      message: "Value is not JSON serializable",
    });
  }
}

function decodeGetInput(value: string | null, maxBytes: number): unknown {
  if (value === null) {
    return undefined;
  }
  if (new TextEncoder().encode(value).byteLength > maxBytes) {
    throw new CableError("PAYLOAD_TOO_LARGE", { message: "RPC input is too large" });
  }
  return parseJson(value);
}

function decodeProcedurePath(value: string): string {
  try {
    const path = decodeURIComponent(value);
    if (path.length === 0 || path.includes("/")) {
      throw new CableError("BAD_REQUEST", { message: "Invalid procedure path" });
    }
    return path;
  } catch (cause) {
    if (isCableError(cause)) {
      throw cause;
    }
    throw new CableError("BAD_REQUEST", { cause, message: "Invalid procedure path" });
  }
}

function normalizeBasePath(value: string): string {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isHttpStatus(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599;
}

// oxlint-disable eslint/no-await-in-loop -- A byte limit must be enforced as each ordered stream chunk arrives.
export async function readRequestBody(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new CableError("PAYLOAD_TOO_LARGE", { message: "RPC body is too large" });
    }
  }
  if (request.body === null) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const text: string[] = [];
  let bytes = 0;
  try {
    let finished = false;
    while (!finished) {
      const next = await reader.read();
      if (next.done) {
        finished = true;
        continue;
      }
      bytes += next.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new CableError("PAYLOAD_TOO_LARGE", { message: "RPC body is too large" });
      }
      text.push(decoder.decode(next.value, { stream: true }));
    }
    text.push(decoder.decode());
    return text.join("");
  } catch (cause) {
    if (isCableError(cause)) {
      throw cause;
    }
    throw new CableError("BAD_REQUEST", { cause, message: "RPC body is not valid UTF-8" });
  } finally {
    reader.releaseLock();
  }
}
// oxlint-enable eslint/no-await-in-loop

function assertUniqueIds(
  values: ReadonlyArray<{ readonly id: string }>,
  label: string,
  code: "BAD_REQUEST" | "PARSE_ERROR",
): void {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) {
      throw new CableError(code, { message: `${label} contains duplicate id '${value.id}'` });
    }
    ids.add(value.id);
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function assertJsonValue(
  value: unknown,
  code: "BAD_REQUEST" | "INTERNAL",
  position: "array" | "object" | "root",
  ancestors: WeakSet<object>,
  depth: number,
): void {
  if (value === null || isAllowedJsonScalar(value, position)) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw invalidJsonData(code, "RPC data contains a non-finite number");
    }
    return;
  }
  if (typeof value !== "object") {
    throw invalidJsonData(code, "RPC data contains a non-JSON value");
  }
  assertJsonContainer(value, code, ancestors, depth);
}

function assertJsonContainer(
  value: object,
  code: "BAD_REQUEST" | "INTERNAL",
  ancestors: WeakSet<object>,
  depth: number,
): void {
  if (depth >= 100) {
    throw invalidJsonData(code, "RPC data exceeds the maximum nesting depth");
  }
  if (ancestors.has(value)) {
    throw invalidJsonData(code, "RPC data contains a cycle");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assertJsonArray(value, code, ancestors, depth);
      return;
    }
    assertJsonObject(value, code, ancestors, depth);
  } finally {
    ancestors.delete(value);
  }
}

function assertJsonArray(
  value: readonly unknown[],
  code: "BAD_REQUEST" | "INTERNAL",
  ancestors: WeakSet<object>,
  depth: number,
): void {
  for (const item of value) {
    assertJsonValue(item, code, "array", ancestors, depth + 1);
  }
}

function assertJsonObject(
  value: object,
  code: "BAD_REQUEST" | "INTERNAL",
  ancestors: WeakSet<object>,
  depth: number,
): void {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalidJsonData(code, "RPC data must use plain objects and arrays");
  }
  if (Object.getOwnPropertySymbols(value).length > 0 || Object.hasOwn(value, "toJSON")) {
    throw invalidJsonData(code, "RPC data contains properties JSON would transform or omit");
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw invalidJsonData(code, "RPC data contains properties JSON would transform or omit");
    }
    const item: unknown = descriptor.value;
    assertJsonValue(item, code, "object", ancestors, depth + 1);
  }
}

function isAllowedJsonScalar(value: unknown, position: "array" | "object" | "root"): boolean {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (value === undefined && position !== "array")
  );
}

function invalidJsonData(
  code: "BAD_REQUEST" | "INTERNAL",
  message: string,
): CableError<"BAD_REQUEST" | "INTERNAL"> {
  return new CableError(code, { message });
}

function fatalResponse(error: unknown): Response {
  const wire = isCableError(error) ? toWireError(error) : internalWireError();
  return jsonResponse(encodeWireError(wire), wire.status);
}

function toWireError(error: CableError<string>): WireError {
  if (error.code === "INTERNAL") {
    return internalWireError();
  }
  const wire: MutableWireError = {
    code: error.code,
    message: error.message,
    status: error.status,
  };
  if (error.data !== undefined) {
    wire.data = error.data;
  }
  return wire;
}

function internalWireError(): WireError {
  return { code: "INTERNAL", message: "Internal server error", status: 500 };
}

function encodeWireError(error: WireError): string {
  return encodeJson({ error });
}

function jsonResponse(body: string, status: number): Response {
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
    status,
  });
}
