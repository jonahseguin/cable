import type { ErrorMap } from "@cablejs/contract";

import type { ChannelWireError } from "../channel-protocol.js";
import { BUILTIN_CODES, CableError, isCableError } from "../errors.js";
import { assertJsonData } from "../rpc.js";
import { validate } from "../validation.js";

const builtinCodes = new Set<string>(BUILTIN_CODES);

interface MutableChannelWireError {
  code: string;
  data?: unknown;
  message?: string;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Handler failures enter here and are narrowed to CableError before exposure.
export async function channelError(error: unknown, declared: ErrorMap): Promise<ChannelWireError> {
  if (!isCableError(error)) {
    return internalError();
  }
  if (error.code === "INTERNAL") {
    return internalError();
  }
  if (builtinCodes.has(error.code)) {
    try {
      return exposedError(error);
    } catch {
      return internalError();
    }
  }
  const schema = declared[error.code];
  if (schema === undefined) {
    return internalError();
  }
  try {
    const data = await validate(schema, error.data);
    assertJsonData(data, "INTERNAL");
    return exposedError(
      new CableError(error.code, { data, message: error.message, status: error.status }),
    );
  } catch {
    return internalError();
  }
}

export function internalError(): ChannelWireError {
  return { code: "INTERNAL", message: "Internal server error" };
}

function exposedError(error: CableError<string>): ChannelWireError {
  const wire: MutableChannelWireError = {
    code: error.code,
    message: error.message,
  };
  if (error.data !== undefined) {
    assertJsonData(error.data, "INTERNAL");
    wire.data = error.data;
  }
  return wire;
}
