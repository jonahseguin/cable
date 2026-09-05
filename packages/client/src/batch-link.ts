import { CableError, decodeBatchResponse, encodeBatch } from "@cable/core";
import type { RpcCall, RpcResult } from "@cable/core";

import { getRequest } from "./get-request.js";
import { httpError } from "./http-error.js";
import type { Link, LinkContext } from "./link.js";

/** Bounds an HTTP batch by request count and by time spent waiting to flush. */
export interface BatchLinkOptions {
  readonly maxBatch?: number;
  readonly maxWait?: number;
}

interface PendingCall {
  readonly call: RpcCall;
  readonly resolve: (result: RpcResult) => void;
  readonly reject: (cause: Error) => void;
}

async function send(context: LinkContext, pending: readonly PendingCall[]): Promise<void> {
  try {
    const headers = await context.headers();
    headers.set("content-type", "application/json");
    const response = await context.fetch(`${context.url.replace(/\/$/u, "")}/rpc`, {
      method: "POST",
      headers,
      body: encodeBatch({ calls: pending.map(({ call }) => call) }),
    });
    if (!response.ok) {
      throw httpError(response.status);
    }
    const batch = decodeBatchResponse(await response.text());
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
    for (const request of pending) {
      const result = results.get(request.call.id);
      if (result === undefined) throw new Error("Validated RPC result disappeared.");
      request.resolve(result);
    }
  } catch (cause) {
    const error = cause instanceof CableError ? cause : new CableError("UNAVAILABLE", { cause });
    for (const request of pending) request.reject(error);
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
      return new Promise<RpcResult>((resolve, reject) => {
        queue.push({ call, resolve, reject });
        if (queue.length >= maxBatch) flush();
        else timer ??= setTimeout(flush, maxWait);
      });
    };
  };
}
