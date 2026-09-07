import type { AnyChannelContract } from "@cablejs/contract";
import {
  createEngine,
  parseChannelKey,
  type ChannelImplementation,
  type EngineOptions,
  type GrantSecret,
  type Host,
  type HostHandlers,
  type HostKey,
  type HostLimits,
  type PeerMessage,
  type SignedGrant,
  type UpgradeResult,
} from "@cablejs/core";

import { NodeConnection, type NodeSocket } from "./connection.js";
import { NodeSchedule } from "./schedule.js";
import { NodeStorage } from "./storage.js";

const DEFAULT_LIMITS: HostLimits = Object.freeze({
  attachmentBytes: 16_384,
  maxFrameBytes: 1_048_576,
});
const IDLE_MS = 300_000;

/** One typed channel implementation captured without widening it for the registry. */
export interface NodeHandlerHost<TChannel extends AnyChannelContract = AnyChannelContract> {
  readonly channel: TChannel;
  readonly create: (host: Host, grantSecret: GrantSecret) => HostHandlers;
}

/** Bind one channel implementation for the handler-owned Node runtime. */
export function nodeHost<TChannel extends AnyChannelContract, TIdentity>(
  channel: TChannel,
  implementation: ChannelImplementation<TChannel, TIdentity>,
  options: { readonly engine?: Omit<EngineOptions, "grantSecret"> } = {},
): NodeHandlerHost<TChannel> {
  return {
    channel,
    create: (host, grantSecret) =>
      createEngine(channel, implementation, host, { ...options.engine, grantSecret }),
  };
}

export type NodePreparedUpgrade =
  | { readonly result: Extract<UpgradeResult, { readonly accept: true }> }
  | { readonly result: Extract<UpgradeResult, { readonly accept: false }> };

/** Per-handler Node host registry, storage owner, and engine cache. */
export class NodeRuntime {
  private readonly entries = new Map<HostKey, NodeEntry>();
  private readonly byChannel = new Map<AnyChannelContract, NodeHandlerHost>();
  private readonly grantSecret: GrantSecret;
  private readonly limits: HostLimits;
  private readonly preparedEntries = new WeakMap<object, NodeEntry>();
  private closed = false;

  public constructor(
    hosts: readonly NodeHandlerHost[],
    options: { readonly grantSecret: GrantSecret; readonly limits?: HostLimits },
  ) {
    this.grantSecret = options.grantSecret;
    this.limits = options.limits ?? DEFAULT_LIMITS;
    for (const host of hosts) this.byChannel.set(host.channel, host);
  }

  public async prepareUpgrade(
    host: NodeHandlerHost,
    key: HostKey,
    request: Request,
    grant: SignedGrant,
  ): Promise<NodePreparedUpgrade> {
    this.assertOpen();
    const entry = this.entry(host, key);
    const result = await entry.handlers().onUpgrade(request, grant);
    if (!result.accept) return { result };
    const prepared = { result };
    this.preparedEntries.set(prepared, entry);
    return prepared;
  }

  public attachUpgrade(
    prepared: Extract<NodePreparedUpgrade, { readonly result: { readonly accept: true } }>,
    socket: NodeUpgradeSocket,
  ): NodeConnection {
    this.assertOpen();
    const entry = this.preparedEntries.get(prepared);
    if (entry === undefined) throw new Error("Node upgrade was not prepared by this runtime");
    this.preparedEntries.delete(prepared);
    const connection = new NodeConnection(
      socket,
      prepared.result.tags,
      prepared.result.attachment,
      this.limits.attachmentBytes,
    );
    entry.attach(connection, socket);
    return connection;
  }

  // oxlint-disable-next-line anti-slop/no-unknown-returns -- Peer operations are parsed by their operation-specific core caller.
  public async peer(key: HostKey, message: PeerMessage): Promise<unknown> {
    this.assertOpen();
    return this.entryForKey(key).handlers().onPeer(message);
  }

  public async shutdown(): Promise<void> {
    this.closed = true;
    await Promise.all(Array.from(this.entries.values(), (entry) => entry.shutdown()));
    this.entries.clear();
  }

  /** Package-internal conformance access to the actual Host capability. */
  public host(key: HostKey): Host | undefined {
    return this.entries.get(key);
  }

  private entry(host: NodeHandlerHost, key: HostKey): NodeEntry {
    this.assertOpen();
    const existing = this.entries.get(key);
    if (existing !== undefined) return existing;
    const entry = new NodeEntry(this, host, key, this.grantSecret, this.limits);
    entry.handlers();
    this.entries.set(key, entry);
    return entry;
  }

  private entryForKey(key: HostKey): NodeEntry {
    const existing = this.entries.get(key);
    if (existing !== undefined) return existing;
    for (const host of this.byChannel.values()) {
      try {
        parseChannelKey(host.channel, key);
        return this.entry(host, key);
      } catch {
        continue;
      }
    }
    throw new Error(`No Node Host is registered for '${key}'.`);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Node runtime is shut down");
  }
}

/** Internal structural contract for the accepted `ws` socket. */
export interface NodeUpgradeSocket extends NodeSocket {
  on(event: "close", listener: (code: number, reason: Buffer) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(
    event: "message",
    listener: (data: Buffer | readonly Buffer[] | ArrayBuffer | string, isBinary: boolean) => void,
  ): this;
}

class NodeEntry implements Host {
  public readonly key: HostKey;
  public readonly limits: HostLimits;
  public readonly schedule: NodeSchedule;
  public readonly storage = new NodeStorage();
  public readonly peers = {
    // SAFETY: The core peer caller chooses T after the receiving engine parses its operation result.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The engine owns the operation-specific result contract.
    call: <T>(key: HostKey, message: PeerMessage) => this.runtime.peer(key, message) as Promise<T>,
    send: (key: HostKey, message: PeerMessage) =>
      this.runtime.peer(key, message).then(() => undefined),
  };
  private readonly connectionsById = new Map<string, NodeConnection>();
  private readonly factory: NodeHandlerHost;
  private readonly grantSecret: GrantSecret;
  private readonly runtime: NodeRuntime;
  private handlersCache: HostHandlers | undefined;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private readonly pending = new Set<Promise<void>>();

  public constructor(
    runtime: NodeRuntime,
    factory: NodeHandlerHost,
    key: HostKey,
    grantSecret: GrantSecret,
    limits: HostLimits,
  ) {
    this.runtime = runtime;
    this.factory = factory;
    this.key = key;
    this.grantSecret = grantSecret;
    this.limits = limits;
    this.schedule = new NodeSchedule(async () => {
      try {
        await this.handlers().onAlarm();
      } finally {
        void this.armIdle();
      }
    });
  }

  public connections(tag?: string): Iterable<NodeConnection> {
    const all = Array.from(this.connectionsById.values());
    return tag === undefined ? all : all.filter((connection) => connection.tags.includes(tag));
  }

  public now(): number {
    return Date.now();
  }
  public waitUntil(promise: Promise<unknown>): void {
    const tracked = promise.then(
      () => undefined,
      () => undefined,
    );
    this.pending.add(tracked);
    void tracked.then(() => {
      this.pending.delete(tracked);
      void this.armIdle();
      return undefined;
    });
  }
  public handlers(): HostHandlers {
    return (this.handlersCache ??= this.factory.create(this, this.grantSecret));
  }

  public attach(connection: NodeConnection, socket: NodeUpgradeSocket): void {
    this.clearIdle();
    this.connectionsById.set(connection.id, connection);
    socket.on(
      "message",
      (data, isBinary) => void this.handlers().onMessage(connection, messageData(data, isBinary)),
    );
    socket.on("error", (error) => void this.handlers().onError(connection, error));
    socket.on("close", (code, reason) => {
      this.connectionsById.delete(connection.id);
      void this.handlers()
        .onClose(connection, code, reason.toString(), true)
        .finally(() => {
          void this.armIdle();
        });
    });
  }

  public async shutdown(): Promise<void> {
    this.clearIdle();
    this.schedule.dispose();
    for (const connection of this.connectionsById.values())
      connection.close(1001, "Node runtime shutdown");
    this.connectionsById.clear();
    await Promise.all(this.pending);
    this.handlersCache = undefined;
  }

  private async armIdle(): Promise<void> {
    if (this.connectionsById.size !== 0 || this.pending.size !== 0 || this.idle !== undefined)
      return;
    const due = await this.schedule.get();
    if (due !== null && due <= this.now()) return;
    this.idle = setTimeout(() => {
      this.idle = undefined;
      if (this.connectionsById.size === 0) this.handlersCache = undefined;
    }, IDLE_MS);
  }
  private clearIdle(): void {
    if (this.idle !== undefined) clearTimeout(this.idle);
    this.idle = undefined;
  }
}

/* oxlint-disable anti-slop/no-runtime-typeof -- ws provides a closed RawData union; isBinary selects its wire representation. */
function messageData(
  data: Buffer | readonly Buffer[] | ArrayBuffer | string,
  isBinary: boolean,
): string | ArrayBuffer {
  if (!isBinary) {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    return (Array.isArray(data) ? Buffer.concat(data) : data).toString();
  }
  if (data instanceof ArrayBuffer) return data;
  if (typeof data === "string") return new TextEncoder().encode(data).buffer;
  if (isBufferList(data)) return Uint8Array.from(Buffer.concat(data)).buffer;
  return Uint8Array.from(data).buffer;
}

function isBufferList(value: Buffer | readonly Buffer[]): value is readonly Buffer[] {
  return Array.isArray(value);
}
/* oxlint-enable anti-slop/no-runtime-typeof */
