import {
  CableError,
  decodeBatchResponse,
  diagnosticFailure,
  encodeBatch,
  observeDiagnostic,
} from "@cablejs/core";
import type { RpcCall, RpcResult } from "@cablejs/core";

import { getRequest } from "./get-request.js";
import { httpError } from "./http-error.js";
import { abortError, isAborted, type Link, type LinkContext, withSignal } from "./link.js";

/** Bounds an HTTP batch by request count and by time spent waiting to flush. */
export interface BatchLinkOptions {
  readonly maxBatch?: number;
  readonly maxWait?: number;
}

interface PendingCall {
  readonly call: RpcCall;
  readonly startedAt: number;
  readonly resolve: (result: RpcResult) => void;
  readonly reject: (cause: Error) => void;
  cleanup: () => void;
}

function observeCall(
  context: LinkContext,
  pending: PendingCall,
  outcome: "ok" | "error" | "cancelled",
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Causes cross the transport boundary and are classified before emission.
  error?: unknown,
): void {
  const base = {
    durationMs: Math.max(0, Date.now() - pending.startedAt),
    name: pending.call.path,
    runtime: "client" as const,
    startedAt: pending.startedAt,
    transport: "rpc" as const,
    type: "operation" as const,
  };
  observeDiagnostic(
    context.diagnostics,
    outcome === "error"
      ? {
          ...base,
          failure: diagnosticFailure(error),
          outcome,
        }
      : {
          ...base,
          outcome,
        },
  );
}

async function fetchBatch(
  context: LinkContext,
  pending: readonly PendingCall[],
  signal: AbortSignal | undefined,
): Promise<readonly RpcResult[]> {
  if (isAborted(signal)) throw abortError(signal);
  const headers = await context.headers();
  if (isAborted(signal)) throw abortError(signal);
  headers.set("content-type", "application/json");
  const response = await context.fetch(
    `${context.url.replace(/\/$/u, "")}/rpc`,
    withSignal(
      {
        method: "POST",
        headers,
        body: encodeBatch({ calls: pending.map(({ call }) => call) }),
      },
      signal,
    ),
  );
  if (!response.ok) throw httpError(response.status);
  const text = await response.text();
  if (isAborted(signal)) throw abortError(signal);
  return decodeResults(text, pending);
}

function decodeResults(text: string, pending: readonly PendingCall[]): readonly RpcResult[] {
  const batch = decodeBatchResponse(text);
  const expected = new Set(pending.map(({ call }) => call.id));
  const results = new Map<string, RpcResult>();
  for (const result of batch.results) {
    if (!expected.has(result.id) || results.has(result.id)) {
      throw new CableError("PARSE_ERROR", {
        message: "RPC response contains unexpected or duplicate IDs.",
      });
    }
    results.set(result.id, result);
  }
  if (results.size !== pending.length) {
    throw new CableError("PARSE_ERROR", { message: "RPC response omitted a result." });
  }
  return pending.map(({ call }) => {
    const result = results.get(call.id);
    if (result === undefined) throw new Error("Validated RPC result disappeared.");
    return result;
  });
}

function resolveBatch(
  context: LinkContext,
  pending: readonly PendingCall[],
  results: readonly RpcResult[],
): void {
  for (const [index, request] of pending.entries()) {
    const result = results[index];
    if (result === undefined) throw new Error("Validated RPC result disappeared.");
    request.cleanup();
    if (result.ok) observeCall(context, request, "ok");
    else observeCall(context, request, "error", new CableError(result.error.code, result.error));
    request.resolve(result);
  }
}

function rejectBatch(
  context: LinkContext,
  pending: readonly PendingCall[],
  signal: AbortSignal | undefined,
  cause: unknown,
): void {
  const error = cause instanceof CableError ? cause : new CableError("UNAVAILABLE", { cause });
  const cancelled = isAborted(signal);
  const settled = cancelled ? abortError(signal) : error;
  for (const request of pending) {
    request.cleanup();
    observeCall(
      context,
      request,
      cancelled ? "cancelled" : "error",
      cancelled ? undefined : settled,
    );
    request.reject(settled);
  }
}

async function send(context: LinkContext, pending: readonly PendingCall[]): Promise<void> {
  const signal = pending[0]?.call.signal;
  try {
    resolveBatch(context, pending, await fetchBatch(context, pending, signal));
  } catch (cause) {
    rejectBatch(context, pending, signal, cause);
  }
}

/** Batch concurrent calls over POST; failures never leave queued promises unresolved. */
export function batchLink(options: BatchLinkOptions = {}): Link {
  const maxBatch = options.maxBatch ?? 20;
  const maxWait = options.maxWait ?? 10;
  if (!Number.isSafeInteger(maxBatch) || maxBatch < 1)
    throw new RangeError("maxBatch must be a positive integer.");
  if (!Number.isFinite(maxWait) || maxWait < 0)
    throw new RangeError("maxWait must be nonnegative and finite.");

  return (context) => {
    let queue: PendingCall[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    function flush(): void {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const pending = queue;
      queue = [];
      // send settles every pending request, including failures from fetch and the decoder.
      void send(context, pending);
    }

    return (call) => {
      if (context.transport?.(call.path)?.method === "GET") return getRequest(context, call);
      if (isAborted(call.signal)) {
        const pending: PendingCall = {
          call,
          startedAt: Date.now(),
          resolve: () => undefined,
          reject: () => undefined,
          cleanup: () => undefined,
        };
        observeCall(context, pending, "cancelled");
        return Promise.reject(abortError(call.signal));
      }
      return new Promise<RpcResult>((resolve, reject) => {
        const pending: PendingCall = {
          call,
          startedAt: Date.now(),
          resolve,
          reject,
          cleanup: () => undefined,
        };
        const signal = call.signal;
        if (signal !== undefined) {
          const onAbort = (): void => {
            const index = queue.indexOf(pending);
            if (index === -1) return;
            queue.splice(index, 1);
            pending.cleanup();
            observeCall(context, pending, "cancelled");
            reject(abortError(signal));
            if (queue.length === 0 && timer !== undefined) {
              clearTimeout(timer);
              timer = undefined;
            }
          };
          signal.addEventListener("abort", onAbort, { once: true });
          pending.cleanup = () => {
            signal.removeEventListener("abort", onAbort);
          };
        }
        const queuedSignal = queue[0]?.call.signal;
        if (queue.length > 0 && queuedSignal !== signal) flush();
        queue.push(pending);
        if (queue.length >= maxBatch) flush();
        else timer ??= setTimeout(flush, maxWait);
      });
    };
  };
}
