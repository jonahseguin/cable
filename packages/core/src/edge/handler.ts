/* oxlint-disable anti-slop/no-unknown-parameters -- HTTP, JSON, authentication,
and adapter results are narrowed at this runtime-neutral edge boundary. */
import type { ContractTree } from "@cablejs/contract";

import { resolveChannel } from "../channel-key.js";
import { diagnosticFailure, observeDiagnostic } from "../diagnostics.js";
import { CableError, isCableError } from "../errors.js";
import { signGrant } from "../grant.js";
import type { GrantClaims, HostKey } from "../host.js";
import {
  assertJsonData,
  createRpcHandler,
  readRequestBody,
  type RpcCall,
  type RpcResult,
  type WireError,
} from "../rpc.js";
import { callEdgeHost, createEdgeHosts, edgeOperationContext, normalizeGrants } from "./hosts.js";
import { assertRecordKeys, requireRecord } from "./records.js";
import { EdgeRegistry, edgeContractTree } from "./registry.js";
import type {
  EdgeContract,
  EdgeHandler,
  EdgeHandlerOptions,
  EdgeHosts,
  EdgePrincipal,
  EdgeProcedures,
  EdgeUpgrade,
} from "./types.js";

const DEFAULT_BASE_PATH = "/_cable";
const DEFAULT_GRANT_TTL_MS = 60_000;
const DEFAULT_MAX_BATCH_SIZE = 100;
const DEFAULT_MAX_BODY_BYTES = 1_048_576;

interface AuthenticatedRequest<TIdentity> {
  readonly principal: EdgePrincipal<TIdentity>;
}

interface HostCallEnvelope {
  readonly input: RpcCall["input"];
  readonly params: RpcCall["input"];
}

/** Bind global procedures and channel transports to the portable Cable routes. */
export function createEdgeHandler<
  TTree extends ContractTree,
  TContext extends object,
  TEnv,
  TExecution,
  TIdentity,
  TUpgrade extends EdgeUpgrade = Response,
>(
  contract: EdgeContract<TTree>,
  procedures: EdgeProcedures<TTree, TContext>,
  options: EdgeHandlerOptions<TTree, TContext, TEnv, TExecution, TIdentity, TUpgrade>,
): EdgeHandler<TEnv, TExecution, TUpgrade, TTree, TIdentity> {
  const tree = edgeContractTree(contract);
  const policy = edgePolicy(options);

  function createHosts(env: TEnv, principal: EdgePrincipal<TIdentity>): EdgeHosts<TTree> {
    const hostOptions = {
      principal,
      registrations: options.hosts(env),
    };
    return createEdgeHosts<TTree, TIdentity, TExecution, TUpgrade>(
      contract,
      options.grants === undefined ? hostOptions : { ...hostOptions, grants: options.grants },
    );
  }

  return {
    hosts(input) {
      return createHosts(input.env, input.principal);
    },
    async fetch(request, env, execution) {
      const url = new URL(request.url);
      const rpcPath = `${policy.basePath}/rpc`;
      try {
        if (isRpcRoute(request, url, rpcPath)) {
          if (request.method === "POST") requireJsonContentType(request);
          const handler = createRpcHandler(procedures, {
            basePath: policy.basePath,
            context: async (contextRequest) => {
              try {
                const authenticated = await authenticate(contextRequest, env, options);
                const hosts = createHosts(env, authenticated.principal);
                return await options.context({
                  env,
                  execution,
                  hosts,
                  identity: authenticated.principal.identity,
                  request: contextRequest,
                });
              } catch (error) {
                await reportOnError(options, error, "RPC context", contextRequest);
                throw error;
              }
            },
            maxBatchSize: policy.maxBatchSize,
            maxBodyBytes: policy.maxBodyBytes,
          });
          return await handler.fetch(request);
        }
        if (url.pathname === `${policy.basePath}/ws`) {
          return await handleUpgrade(tree, request, url, env, execution, options, policy);
        }
        if (url.pathname.startsWith(`${policy.basePath}/host/`)) {
          return await handleHostCall(tree, request, url, env, options, policy);
        }
        return new Response("Not found", { status: 404 });
      } catch (error) {
        await report(options, error, "edge request", request);
        return edgeFailureResponse(error);
      }
    },
  };
}

interface EdgePolicy {
  readonly basePath: string;
  readonly grantTtlMs: number;
  readonly maxBatchSize: number;
  readonly maxBodyBytes: number;
  readonly origins: ReadonlySet<string>;
}

function edgePolicy<
  TTree extends ContractTree,
  TContext extends object,
  TEnv,
  TExecution,
  TIdentity,
  TUpgrade extends EdgeUpgrade,
>(options: EdgeHandlerOptions<TTree, TContext, TEnv, TExecution, TIdentity, TUpgrade>): EdgePolicy {
  const origins = new Set<string>();
  if (options.credentials.mode === "cookie") {
    for (const origin of options.credentials.origins) {
      if (new URL(origin).origin !== origin) {
        throw new TypeError("Cookie credential origins must be exact URL origins");
      }
      origins.add(origin);
    }
    if (origins.size === 0) throw new TypeError("Cookie credentials require at least one origin");
  }
  return {
    basePath: normalizeBasePath(options.basePath ?? DEFAULT_BASE_PATH),
    grantTtlMs: positiveInteger(options.grantTtlMs ?? DEFAULT_GRANT_TTL_MS, "grantTtlMs"),
    maxBatchSize: positiveInteger(options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE, "maxBatchSize"),
    maxBodyBytes: positiveInteger(options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES, "maxBodyBytes"),
    origins,
  };
}

async function handleUpgrade<
  TTree extends ContractTree,
  TEnv,
  TExecution,
  TIdentity,
  TUpgrade extends EdgeUpgrade,
>(
  tree: ContractTree,
  request: Request,
  url: URL,
  env: TEnv,
  execution: TExecution,
  options: EdgeHandlerOptions<TTree, object, TEnv, TExecution, TIdentity, TUpgrade>,
  policy: EdgePolicy,
): Promise<Response | TUpgrade> {
  if (request.method !== "GET") return methodNotAllowed("GET");
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    throw new CableError("BAD_REQUEST", { message: "WebSocket Upgrade header is required" });
  }
  requireAllowedOrigin(request, options, policy.origins);
  const key = parseHostKey(url.searchParams.get("ch"));
  const rawParams = parseJsonParameter(url.searchParams.get("params"), "params");
  const registry = new EdgeRegistry<TExecution, TUpgrade>(tree, options.hosts(env));
  const registered = registry.select(key);
  const resolved = await resolveChannel(registered.registration.channel, rawParams);
  if (resolved.key !== key) {
    throw new CableError("BAD_REQUEST", { message: "Channel parameters do not match host key" });
  }
  const authenticated = await authenticate(request, env, options);
  const context = edgeOperationContext(
    registered,
    resolved,
    authenticated.principal,
    options.grants,
  );
  const grants = await resolveGrants(context);
  const now = readNow(options.now);
  const claims = grantClaims(context, grants, now, policy.grantTtlMs);
  const grant = await signGrant(claims, await options.grantSecret(env));
  return registered.registration.transport.upgrade(key, sanitizeUpgrade(request), grant, execution);
}

async function handleHostCall<
  TTree extends ContractTree,
  TEnv,
  TExecution,
  TIdentity,
  TUpgrade extends EdgeUpgrade,
>(
  tree: ContractTree,
  request: Request,
  url: URL,
  env: TEnv,
  options: EdgeHandlerOptions<TTree, object, TEnv, TExecution, TIdentity, TUpgrade>,
  policy: EdgePolicy,
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  requireJsonContentType(request);
  const route = parseHostCallPath(url.pathname, policy.basePath);
  const body = parseHostCallBody(await readRequestBody(request, policy.maxBodyBytes));
  const registry = new EdgeRegistry<TExecution, TUpgrade>(tree, options.hosts(env));
  const registered = registry.select(route.key);
  const resolved = await resolveChannel(registered.registration.channel, body.params);
  if (resolved.key !== route.key) {
    throw new CableError("BAD_REQUEST", { message: "Channel parameters do not match host key" });
  }
  const authenticated = await authenticate(request, env, options);
  const context = edgeOperationContext(
    registered,
    resolved,
    authenticated.principal,
    options.grants,
  );
  try {
    const data = await callEdgeHost(context, route.procedure, body.input);
    return rpcResultResponse({ data, id: "host", ok: true }, 200);
  } catch (error) {
    await report(options, error, "host procedure", request);
    const wire = wireError(error);
    return rpcResultResponse({ error: wire, id: "host", ok: false }, wire.status);
  }
}

async function authenticate<
  TTree extends ContractTree,
  TContext extends object,
  TEnv,
  TExecution,
  TIdentity,
  TUpgrade extends EdgeUpgrade,
>(
  request: Request,
  env: TEnv,
  options: EdgeHandlerOptions<TTree, TContext, TEnv, TExecution, TIdentity, TUpgrade>,
): Promise<AuthenticatedRequest<TIdentity>> {
  const identity = await options.authenticate(request, env);
  if (identity === null) return { principal: { identity } };
  const uid = await options.uid?.(identity);
  return uid === undefined ? { principal: { identity } } : { principal: { identity, uid } };
}

async function resolveGrants<TIdentity, TExecution, TUpgrade extends EdgeUpgrade>(
  context: ReturnType<typeof edgeOperationContext<TIdentity, TExecution, TUpgrade>>,
): Promise<readonly string[]> {
  const identity = context.principal.identity;
  if (identity === null) throw new CableError("UNAUTHORIZED");
  return normalizeGrants(
    (await context.grants?.(identity, context.resolved.key, context.resolved.params)) ?? [],
  );
}

function grantClaims<TIdentity, TExecution, TUpgrade extends EdgeUpgrade>(
  context: ReturnType<typeof edgeOperationContext<TIdentity, TExecution, TUpgrade>>,
  grants: readonly string[],
  now: number,
  ttl: number,
): GrantClaims {
  const exp = now + ttl;
  if (!Number.isSafeInteger(exp)) throw new TypeError("Grant expiry exceeds safe integer range");
  const base = {
    exp,
    grants,
    hostKey: context.resolved.key,
    identity: context.principal.identity,
    params: context.resolved.params,
    v: 1 as const,
  };
  return context.principal.uid === undefined ? base : { ...base, uid: context.principal.uid };
}

function isRpcRoute(request: Request, url: URL, rpcPath: string): boolean {
  return (
    (request.method === "POST" && url.pathname === rpcPath) ||
    (request.method === "GET" && url.pathname.startsWith(`${rpcPath}/`))
  );
}

function requireAllowedOrigin<
  TTree extends ContractTree,
  TContext extends object,
  TEnv,
  TExecution,
  TIdentity,
  TUpgrade extends EdgeUpgrade,
>(
  request: Request,
  options: EdgeHandlerOptions<TTree, TContext, TEnv, TExecution, TIdentity, TUpgrade>,
  origins: ReadonlySet<string>,
): void {
  if (options.credentials.mode !== "cookie") return;
  const origin = request.headers.get("origin");
  if (origin === null || !origins.has(origin)) {
    throw new CableError("FORBIDDEN", { message: "WebSocket Origin is not allowed" });
  }
}

function requireJsonContentType(request: Request): void {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new CableError("BAD_REQUEST", { message: "Content-Type must be application/json" });
  }
}

function sanitizeUpgrade(request: Request): Request {
  const url = new URL(request.url);
  url.searchParams.delete("token");
  const headers = new Headers(request.headers);
  const names = Array.from(headers.keys());
  for (const name of names) {
    const normalized = name.toLowerCase();
    if (
      normalized === "authorization" ||
      normalized === "cookie" ||
      normalized.startsWith("x-cable-")
    ) {
      headers.delete(name);
    }
  }
  return new Request(url, { headers, method: request.method });
}

interface HostCallPath {
  readonly key: HostKey;
  readonly procedure: string;
}

function parseHostCallPath(pathname: string, basePath: string): HostCallPath {
  const parts = pathname.slice(`${basePath}/host/`.length).split("/");
  if (parts.length !== 2) throw new CableError("BAD_REQUEST", { message: "Invalid host route" });
  const key = parseHostKey(decodeRoutePart(parts[0], "host key"));
  const procedure = decodeRoutePart(parts[1], "host procedure");
  return { key, procedure };
}

function parseHostCallBody(text: string): HostCallEnvelope {
  const body = requireRecord(parseJson(text, "host call body"), "Host call body", badRequest);
  assertRecordKeys(body, ["input", "params"], "Host call body", badRequest);
  if (!Object.hasOwn(body, "params")) {
    throw new CableError("BAD_REQUEST", { message: "Host call body params are required" });
  }
  return { input: body["input"], params: body["params"] };
}

function parseJsonParameter(value: string | null, name: string): RpcCall["input"] {
  if (value === null) throw new CableError("BAD_REQUEST", { message: `${name} is required` });
  return parseJson(value, name);
}

function parseJson(text: string, label: string): RpcCall["input"] {
  try {
    const value: unknown = JSON.parse(text);
    assertJsonData(value, "BAD_REQUEST");
    return value;
  } catch (cause) {
    if (isCableError(cause)) throw cause;
    throw new CableError("PARSE_ERROR", { cause, message: `${label} is not valid JSON` });
  }
}

function badRequest(message: string): never {
  throw new CableError("BAD_REQUEST", { message });
}

function parseHostKey(value: string | null): HostKey {
  if (value === null || value.length === 0) {
    throw new CableError("BAD_REQUEST", { message: "Host key is required" });
  }
  // SAFETY: EdgeRegistry immediately parses this opaque value against each registered channel
  // and rejects non-canonical keys before routing it.
  return value as HostKey; // oxlint-disable-line typescript/no-unsafe-type-assertion -- Canonical parsing establishes the brand at route selection.
}

function decodeRoutePart(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) {
    throw new CableError("BAD_REQUEST", { message: `Missing ${label}` });
  }
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.length === 0 || decoded.includes("/")) throw new Error("Invalid route segment");
    return decoded;
  } catch (cause) {
    throw new CableError("BAD_REQUEST", { cause, message: `Invalid ${label}` });
  }
}

function readNow(now: (() => number) | undefined): number {
  const value = now?.() ?? Date.now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("now must return a non-negative Unix timestamp in milliseconds");
  }
  return value;
}

function normalizeBasePath(value: string): string {
  if (value.includes("?") || value.includes("#")) {
    throw new TypeError("basePath must be a URL pathname");
  }
  const leading = value.startsWith("/") ? value : `/${value}`;
  const normalized = leading.endsWith("/") ? leading.slice(0, -1) : leading;
  if (normalized.length === 0) throw new TypeError("basePath must not be the URL root");
  return normalized;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function methodNotAllowed(method: string): Response {
  return new Response("Method not allowed", { headers: { allow: method }, status: 405 });
}

function wireError(error: unknown): WireError {
  if (!isCableError(error)) {
    return { code: "INTERNAL", message: "Internal server error", status: 500 };
  }
  const base = {
    code: error.code,
    message: error.code === "INTERNAL" ? "Internal server error" : error.message,
    status: error.status,
  };
  return error.data === undefined ? base : { ...base, data: error.data };
}

function rpcResultResponse(result: RpcResult, status: number): Response {
  assertJsonData(result, "INTERNAL");
  return new Response(JSON.stringify(result), {
    headers: { "cache-control": "no-store", "content-type": "application/json" },
    status,
  });
}

function edgeFailureResponse(error: unknown): Response {
  const wire = wireError(error);
  return new Response(JSON.stringify({ error: wire }), {
    headers: { "cache-control": "no-store", "content-type": "application/json" },
    status: wire.status,
  });
}

async function report<
  TTree extends ContractTree,
  TContext extends object,
  TEnv,
  TExecution,
  TIdentity,
  TUpgrade extends EdgeUpgrade,
>(
  options: EdgeHandlerOptions<TTree, TContext, TEnv, TExecution, TIdentity, TUpgrade>,
  error: unknown,
  operation: string,
  request: Request,
): Promise<void> {
  observeDiagnostic(options.diagnostics, {
    at: readNow(options.now),
    failure: diagnosticFailure(error),
    operation,
    runtime: "server",
    type: "fault",
  });
  await reportOnError(options, error, operation, request);
}

async function reportOnError<
  TTree extends ContractTree,
  TContext extends object,
  TEnv,
  TExecution,
  TIdentity,
  TUpgrade extends EdgeUpgrade,
>(
  options: EdgeHandlerOptions<TTree, TContext, TEnv, TExecution, TIdentity, TUpgrade>,
  error: unknown,
  operation: string,
  request: Request,
): Promise<void> {
  try {
    await options.onError?.(error, { operation, request });
  } catch {
    // Error observation cannot replace the request's original failure.
  }
}
