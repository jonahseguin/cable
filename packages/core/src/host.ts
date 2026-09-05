/** The canonical, encoded key for one channel host. */
export type HostKey = string & { readonly __brand: "HostKey" };

/** A host-owned identifier for one physical socket connection. */
export type ConnectionId = string & { readonly __brand: "ConnectionId" };

/** A pointer to verified connection claims stored by the engine. */
export type GrantId = string & { readonly __brand: "GrantId" };

/** Runtime limits that portable host logic must enforce. */
export interface HostLimits {
  readonly attachmentBytes: number;
  readonly maxFrameBytes: number;
}

/** The persisted lifecycle phase for an accepted socket. */
export type ConnectionPhase = "pending" | "ready" | "resuming";

/**
 * Small connection metadata that survives host hibernation.
 *
 * Full identity, grants, and channel parameters live in `gr:<grantId>` storage.
 * `since` records the cursor supplied in `hello`; it is diagnostic evidence,
 * not a delivery acknowledgement.
 */
export interface Attachment {
  readonly cid: ConnectionId;
  readonly grantId: GrantId;
  readonly phase: ConnectionPhase;
  readonly since?: number;
  readonly v: 1;
}

/** Claims authenticated by the edge and bound to one host. */
export interface GrantClaims<TIdentity = unknown, TParams = unknown> {
  /** Exclusive Unix expiry timestamp in milliseconds. */
  readonly exp: number;
  readonly grants: readonly string[];
  readonly hostKey: HostKey;
  readonly identity: TIdentity;
  readonly params: TParams;
  readonly uid?: string;
  readonly v: 1;
}

/** A signed, base64url-encoded grant forwarded during WebSocket upgrade. */
export interface SignedGrant {
  readonly payload: string;
  readonly sig: string;
}

/** Verified connection claims persisted at `gr:<grantId>`. */
export type GrantRecord<TIdentity = unknown, TParams = unknown> = GrantClaims<TIdentity, TParams>;

/** Query options supported by the portable KV storage floor. */
export interface StorageListOptions {
  readonly end?: string;
  readonly limit?: number;
  readonly prefix?: string;
  readonly reverse?: boolean;
  readonly start?: string;
}

/** One SQL result row keyed by the columns selected by an engine query. */
export interface StorageRow {
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- SQL is optional and each engine-owned query defines its result columns.
  readonly [column: string]: unknown;
}

/** Transactional KV storage used by the channel engine. */
export interface Storage {
  delete(keys: string | readonly string[]): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  getMany<T>(keys: readonly string[]): Promise<ReadonlyMap<string, T>>;
  list<T>(options: StorageListOptions): Promise<ReadonlyMap<string, T>>;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Values cross a host-owned structured-clone boundary and are read back through the caller's named T.
  put(key: string, value: unknown): Promise<void>;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storage keys are an intentionally open KV domain.
  putMany(entries: Readonly<Record<string, unknown>>): Promise<void>;
  readonly sql?: (query: string, ...params: readonly unknown[]) => AsyncIterable<StorageRow>;
  transaction<T>(operation: (transaction: Storage) => Promise<T>): Promise<T>;
}

/** The runtime's single durable alarm capability. */
export interface Schedule {
  clear(): Promise<void>;
  get(): Promise<number | null>;
  set(at: number): Promise<void>;
}

/** A runtime-neutral host-to-host message. */
export interface PeerMessage {
  readonly t: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Peer extensions are parsed by the receiving engine.
  readonly [key: string]: unknown;
}

/** Host-to-host and edge-to-host delivery. */
export interface Peers {
  call<T>(key: HostKey, message: PeerMessage): Promise<T>;
  send(key: HostKey, message: PeerMessage): Promise<void>;
}

/** A connected socket exposed by a runtime adapter. */
export interface Connection {
  readonly attachment: {
    get(): Attachment | undefined;
    set(attachment: Attachment): void;
  };
  /** Bytes queued by the runtime, when the adapter can observe them. */
  readonly bufferedAmount?: number;
  readonly id: ConnectionId;
  readonly tags: readonly string[];
  close(code?: number, reason?: string): void;
  send(frame: string | ArrayBuffer): void;
}

/** The portable capabilities supplied to one channel engine. */
export interface Host {
  readonly key: HostKey;
  readonly limits: HostLimits;
  readonly peers: Peers;
  readonly schedule: Schedule;
  readonly storage: Storage;
  autoResponse?(request: string, response: string): void;
  connections(tag?: string): Iterable<Connection>;
  now(): number;
  waitUntil(promise: Promise<unknown>): void;
}

/** The adapter work required after an upgrade is authenticated. */
export type UpgradeResult =
  | {
      readonly accept: true;
      readonly attachment: Attachment;
      readonly tags: readonly string[];
    }
  | { readonly accept: false; readonly response: Response };

/** Runtime callbacks implemented by the channel engine and invoked by adapters. */
export interface HostHandlers {
  onAlarm(): Promise<void>;
  onClose(connection: Connection, code: number, reason: string, wasClean: boolean): Promise<void>;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- A runtime adapter cannot promise a common thrown-value type at this boundary.
  onError(connection: Connection, error: unknown): Promise<void>;
  onMessage(connection: Connection, data: string | ArrayBuffer): Promise<void>;
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The initiating Peers.call generic owns parsing its operation-specific result.
  onPeer(message: PeerMessage): Promise<unknown>;
  onUpgrade(request: Request, grant: SignedGrant): Promise<UpgradeResult>;
}
