import type { QueryTransport } from "@cablejs/contract";
import type { RpcCall, RpcResult } from "@cablejs/core";

/** The next link in the request pipeline. A transport link finishes the request. */
export type NextLink = (call: RpcCall) => Promise<RpcResult>;

/** Per-client dependencies shared by links without importing server code. */
export interface LinkContext {
  readonly url: string;
  readonly fetch: typeof globalThis.fetch;
  readonly headers: () => Promise<Headers>;
  readonly transport?: (path: string) => QueryTransport | undefined;
}

/** A middleware or transport handler created once for each client. */
export type LinkHandler = (call: RpcCall, next: NextLink) => Promise<RpcResult>;

/** Create isolated link state for a client, such as a pending HTTP batch. */
export type Link = (context: LinkContext) => LinkHandler;
