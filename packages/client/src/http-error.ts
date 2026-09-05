import { CableError } from "@cable/core";
import type { BuiltinCode } from "@cable/core";

const codes = new Map<number, BuiltinCode>([
  [400, "BAD_REQUEST"],
  [401, "UNAUTHORIZED"],
  [403, "FORBIDDEN"],
  [404, "NOT_FOUND"],
  [408, "TIMEOUT"],
  [409, "CONFLICT"],
  [413, "PAYLOAD_TOO_LARGE"],
  [429, "TOO_MANY_REQUESTS"],
  [500, "INTERNAL"],
]);

/** Convert an HTTP failure without a valid RPC result to a transport error. */
export function httpError(status: number): CableError {
  return new CableError(codes.get(status) ?? "UNAVAILABLE", {
    status,
    message: `RPC endpoint returned HTTP ${status}.`,
  });
}
