import type {
  ClientFrame,
  HostLimits,
  HostWireFrame,
  PeerMessage,
  StorageListOptions,
} from "@cable/core";

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
}

/** Result of attempting an upgrade through the adapter's real edge seam. */
export type ConformanceUpgrade =
  | { readonly accepted: false }
  | { readonly accepted: true; readonly socket: ConformanceSocket };

/** Runtime operations required by the shared Host scenarios. */
export interface HostConformanceDriver {
  readonly key: string;
  readonly limits: HostLimits;
  attachmentLimitProbe(): Promise<void>;
  advanceTime(milliseconds: number): Promise<void>;
  connectionCount(): Promise<number>;
  connect(grant?: ConformanceGrant): Promise<ConformanceUpgrade>;
  /**
   * Make one connection's server writes throw until the returned restore callback runs.
   *
   * Native workerd does not expose a seam to inject a server-side socket-send
   * failure, so its driver omits this capability and the shared scenario skips.
   */
  readonly capabilities: {
    readonly injectSendFailure: boolean;
  };
  failOneSend?(): Promise<() => void>;
  hibernate?(): Promise<void>;
  now(): Promise<number>;
  peerCall<T>(message: PeerMessage): Promise<T>;
  scheduleGet(): Promise<number | null>;
  storageGet<T>(key: string): Promise<T | undefined>;
  storageList<T>(options: StorageListOptions): Promise<ReadonlyMap<string, T>>;
}

/** Construct an isolated Host configured with the shared conformance fixture. */
export type HostConformanceFactory = () => Promise<HostConformanceDriver>;
