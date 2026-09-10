import {
  CableError,
  decodeResult,
  diagnosticFailure,
  encodeInput,
  observeDiagnostic,
} from "@cablejs/core";
import type { RpcCall, RpcResult } from "@cablejs/core";

import { httpError } from "./http-error.js";
import { abortError, isAborted, withSignal } from "./link.js";
import type { LinkContext } from "./link.js";

/** Execute one cacheable query; GET is never used for a batch. */
export async function getRequest(context: LinkContext, call: RpcCall): Promise<RpcResult> {
  const startedAt = Date.now();
  const observe = (
    outcome: "ok" | "error" | "cancelled",
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Causes cross the transport boundary and are classified before emission.
    error?: unknown,
  ): void => {
    const base = {
      durationMs: Math.max(0, Date.now() - startedAt),
      name: call.path,
      runtime: "client" as const,
      startedAt,
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
  };
  let response: Response | undefined;
  try {
    if (isAborted(call.signal)) throw abortError(call.signal);
    const input = encodeInput(call.input);
    const query = input === undefined ? "" : `?input=${encodeURIComponent(input)}`;
    const path = encodeURIComponent(call.path);
    const headers = await context.headers();
    if (isAborted(call.signal)) throw abortError(call.signal);
    const init: RequestInit = {
      method: "GET",
      headers,
    };
    const currentResponse = await context.fetch(
      `${context.url.replace(/\/$/u, "")}/rpc/${path}${query}`,
      withSignal(init, call.signal),
    );
    response = currentResponse;
    if (isAborted(call.signal)) throw abortError(call.signal);
    const text = await currentResponse.text();
    if (isAborted(call.signal)) throw abortError(call.signal);
    const result = decodeResult(text);
    if (!currentResponse.ok && result.ok) throw httpError(currentResponse.status);
    // There is only one call per GET response; the server uses a fixed wire ID.
    if (result.ok) observe("ok");
    else observe("error", new CableError(result.error.code, result.error));
    return { ...result, id: call.id };
  } catch (cause) {
    if (isAborted(call.signal)) {
      observe("cancelled");
      throw abortError(call.signal);
    }
    observe("error", cause);
    if (response?.ok === false) {
      throw httpError(response.status);
    }
    throw cause;
  }
}
