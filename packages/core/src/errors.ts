/** Error codes that may be produced by the Cable runtime or its transports. */
export const BUILTIN_CODES = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "TIMEOUT",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "TOO_MANY_REQUESTS",
  "INTERNAL",
  "UNAVAILABLE",
  "PARSE_ERROR",
  "VALIDATION",
] as const;

/** A transport-level error code available to every procedure. */
export type BuiltinCode = (typeof BUILTIN_CODES)[number];

/** Options for constructing a typed Cable failure. */
export interface CableErrorOptions<TData> {
  /** An underlying failure retained on the server and omitted from the wire. */
  readonly cause?: unknown;
  /** Data associated with a declared error code. */
  readonly data?: TData;
  /** A safe message suitable for callers. */
  readonly message?: string;
  /** An HTTP status override for an application-specific code. */
  readonly status?: number;
}

/**
 * A procedure failure with a stable code and optional typed data.
 *
 * Throw declared codes from handlers. Undeclared codes and other thrown values
 * are converted to `INTERNAL` before they cross a transport boundary.
 */
export class CableError<TCode extends string = BuiltinCode, TData = unknown> extends Error {
  public readonly code: TCode;
  public readonly data: TData | undefined;
  public readonly status: number;

  public constructor(code: TCode, options: CableErrorOptions<TData> = {}) {
    super(options.message ?? defaultMessage(code));
    this.name = "CableError";
    this.code = code;
    this.data = options.data;
    const status = options.status ?? statusForCode(code);
    if (!Number.isInteger(status) || status < 400 || status > 599) {
      throw new RangeError("CableError status must be an integer from 400 through 599");
    }
    this.status = status;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** Return the default HTTP status for a built-in or declared error code. */
export function statusForCode(code: string): number {
  switch (code) {
    case "BAD_REQUEST":
    case "PARSE_ERROR":
    case "VALIDATION":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "TIMEOUT":
      return 408;
    case "CONFLICT":
      return 409;
    case "PAYLOAD_TOO_LARGE":
      return 413;
    case "TOO_MANY_REQUESTS":
      return 429;
    case "UNAVAILABLE":
      return 503;
    case "INTERNAL":
      return 500;
    default:
      return 400;
  }
}

/** Narrow a typed Cable error union to the member with one code. */
export function isCableError<TError extends CableError<string>, TCode extends TError["code"]>(
  error: TError,
  code: TCode,
): error is Extract<TError, CableError<TCode>>;
/** Test an untrusted value and narrow it to a Cable error with one code. */
export function isCableError<TCode extends string>(
  error: unknown,
  code: TCode,
): error is CableError<TCode>;
/** Test an untrusted value and narrow it to any Cable error. */
export function isCableError(error: unknown): error is CableError<string>;
export function isCableError(error: unknown, code?: string): error is CableError<string> {
  return error instanceof CableError && (code === undefined || error.code === code);
}

function defaultMessage(code: string): string {
  if (code === "INTERNAL") {
    return "Internal server error";
  }
  return code
    .split("_")
    .map((part) => part.toLowerCase())
    .join(" ");
}
