import type { QueryTransport } from "@cablejs/contract";
import type { CableDiagnostics, RpcCall, RpcResult } from "@cablejs/core";

/** Return the caller's abort reason in a stable Error form. */
export function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- DOMException is optional outside web runtimes.
  if (typeof DOMException === "function") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  return new Error("The operation was aborted.");
}

/** Check an optional signal without treating an omitted signal as truthy. */
export function isAborted(signal: AbortSignal | undefined): signal is AbortSignal {
  return signal?.aborted === true;
}

/** Add a request signal while preserving omission for callers without one. */
export function withSignal(init: RequestInit, signal: AbortSignal | undefined): RequestInit {
  if (signal === undefined) return init;
  init.signal = signal;
  return init;
}

/** The next link in the request pipeline. A transport link finishes the request. */
export type NextLink = (call: RpcCall) => Promise<RpcResult>;

/** Per-client dependencies shared by links without importing server code. */
export interface LinkContext {
  readonly diagnostics?: CableDiagnostics;
  readonly url: string;
  readonly fetch: typeof globalThis.fetch;
  readonly headers: () => Promise<Headers>;
  readonly transport?: (path: string) => QueryTransport | undefined;
}

/** A middleware or transport handler created once for each client. */
export type LinkHandler = (call: RpcCall, next: NextLink) => Promise<RpcResult>;

/** Create isolated link state for a client, such as a pending HTTP batch. */
export type Link = (context: LinkContext) => LinkHandler;
