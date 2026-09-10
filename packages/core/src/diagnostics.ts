import { isCableError } from "./errors.js";

/** A privacy-safe classification of an operation failure. */
export interface DiagnosticFailure {
  /** A declared or built-in Cable error code, when Cable produced the error. */
  readonly code?: string;
  /** Whether Cable classified the cause or received an arbitrary exception. */
  readonly kind: "cable" | "exception";
}

interface DiagnosticOperationBase {
  /** Wall-clock time at which Cable started the operation, in Unix milliseconds. */
  readonly startedAt: number;
  /** Elapsed wall-clock time from operation start to its terminal outcome. */
  readonly durationMs: number;
  /** Public procedure path or channel pattern plus operation name. */
  readonly name: string;
  /** Process owning this observation. Values do not imply distributed tracing. */
  readonly runtime: "client" | "server";
  /** Transport that carried the operation. */
  readonly transport: "rpc" | "rest" | "channel-http" | "channel-peer" | "channel-socket";
  readonly type: "operation";
}

/** A terminal procedure or channel-operation observation. */
export type OperationDiagnosticEvent =
  | (DiagnosticOperationBase & { readonly outcome: "ok" })
  | (DiagnosticOperationBase & { readonly outcome: "cancelled" })
  | (DiagnosticOperationBase & { readonly failure: DiagnosticFailure; readonly outcome: "error" });

/** A state change for one managed channel connection. */
export interface ConnectionDiagnosticEvent {
  readonly at: number;
  readonly previous: "connecting" | "resuming" | "open" | "closed";
  readonly reset?: true;
  readonly runtime: "client" | "server";
  readonly state: "connecting" | "resuming" | "open" | "closed";
  readonly transport: "channel-socket";
  readonly type: "connection";
}

/** A failure that has no enclosing terminal operation. */
export interface FaultDiagnosticEvent {
  readonly at: number;
  readonly failure: DiagnosticFailure;
  /** The existing runtime operation label. It never includes payload data. */
  readonly operation: string;
  readonly runtime: "client" | "server";
  readonly type: "fault";
}

/** A privacy-safe runtime observation for a Cable operation or connection. */
export type CableDiagnosticEvent =
  | OperationDiagnosticEvent
  | ConnectionDiagnosticEvent
  | FaultDiagnosticEvent;

/** Receives best-effort diagnostics without participating in Cable control flow. */
export interface CableDiagnostics {
  observe(event: CableDiagnosticEvent): void | Promise<void>;
}

/** Classify an arbitrary cause without exposing its message, stack, or data. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Unknown causes are reduced to a privacy-safe classification.
export function diagnosticFailure(error: unknown): DiagnosticFailure {
  return isCableError(error) ? { code: error.code, kind: "cable" } : { kind: "exception" };
}

/**
 * Deliver one observation without allowing an exporter to affect Cable work.
 *
 * Promise-returning observers may finish after their initiating operation; Cable
 * consumes their rejection and does not wait for them.
 */
export function observeDiagnostic(
  diagnostics: CableDiagnostics | undefined,
  event: CableDiagnosticEvent,
): void {
  if (diagnostics === undefined) return;
  try {
    void Promise.resolve(diagnostics.observe(event)).catch(() => undefined);
  } catch {
    // A diagnostic observer cannot alter the operation it observes.
  }
}
