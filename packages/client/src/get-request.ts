import { decodeResult, encodeInput } from "@cablejs/core";
import type { RpcCall, RpcResult } from "@cablejs/core";

import { httpError } from "./http-error.js";
import type { LinkContext } from "./link.js";

/** Execute one cacheable query; GET is never used for a batch. */
export async function getRequest(context: LinkContext, call: RpcCall): Promise<RpcResult> {
  const input = encodeInput(call.input);
  const query = input === undefined ? "" : `?input=${encodeURIComponent(input)}`;
  const path = encodeURIComponent(call.path);
  const response = await context.fetch(`${context.url.replace(/\/$/u, "")}/rpc/${path}${query}`, {
    method: "GET",
    headers: await context.headers(),
  });
  const text = await response.text();
  try {
    const result = decodeResult(text);
    if (!response.ok && result.ok) throw httpError(response.status);
    // There is only one call per GET response; the server uses a fixed wire ID.
    return { ...result, id: call.id };
  } catch (cause) {
    if (!response.ok) {
      throw httpError(response.status);
    }
    throw cause;
  }
}
