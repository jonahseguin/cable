import { decodeBatch, decodeBatchResponse, encodeBatch, encodeBatchResponse } from "@cablejs/core";
import type { RpcCall, RpcResult } from "@cablejs/core";

/** The portable execution interface exposed by an implemented procedure contract. */
export interface MemoryProcedures<Context> {
  execute(call: RpcCall, context: Context): Promise<RpcResult>;
}

/** A terminal client link that transports RPC calls without a network connection. */
export type MemoryLink = () => (call: RpcCall) => Promise<RpcResult>;

/** Execute in-process while retaining the HTTP transport's JSON serialization semantics. */
export function createMemoryLink<Context>(
  procedures: MemoryProcedures<Context>,
  createContext: () => Context | Promise<Context>,
): MemoryLink {
  return () => async (call) => {
    const request = decodeBatch(encodeBatch({ calls: [call] })).calls[0];
    if (request === undefined) throw new Error("Encoded memory request is missing.");
    const result = await procedures.execute(request, await createContext());
    const response = decodeBatchResponse(encodeBatchResponse({ results: [result] })).results[0];
    if (response === undefined) throw new Error("Encoded memory response is missing.");
    return response;
  };
}
