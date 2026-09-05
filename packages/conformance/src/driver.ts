import type { ClientFrame, Connection, Host, HostWireFrame } from "@cable/core";

/** Grant case requested by a shared conformance scenario. */
export type ConformanceGrant = "expired" | "invalid" | "valid" | "valid-other" | "wrong-host";

/** Raw accepted socket driven by the protocol-level conformance scenarios. */
export interface ConformanceSocket {
  /** Close normally and wait until the Host has processed the callback. */
  close(code?: number, reason?: string): Promise<void>;
  /** Read the next decoded Host frame. */
  next(): Promise<HostWireFrame>;
  /** Send a typed or intentionally malformed client frame and drain Host work. */
  send(frame: ClientFrame | string | ArrayBuffer): Promise<void>;
  /** Drop the runtime socket without an `onClose` callback. */
  terminate(): Promise<void>;
}

/** Result of attempting an upgrade through the adapter's real edge seam. */
export type ConformanceUpgrade =
  | { readonly accepted: false }
  | { readonly accepted: true; readonly socket: ConformanceSocket };

/** Runtime operations required by the shared Host scenarios. */
export interface HostConformanceDriver {
  readonly host: Host;
  advanceTime(milliseconds: number): Promise<void>;
  connect(grant?: ConformanceGrant): Promise<ConformanceUpgrade>;
  /** Make one connection's server writes throw until the returned restore callback runs. */
  failSends(connection: Connection): () => void;
  hibernate?(): Promise<void>;
}

/** Construct an isolated Host configured with the shared conformance fixture. */
export type HostConformanceFactory = () => Promise<HostConformanceDriver>;
