import type { AnyChannelContract } from "@cablejs/contract";
import {
  createEngine,
  type ChannelImplementation,
  type Connection,
  type EngineOptions,
  type Host,
  type HostHandlers,
  type HostKey,
  type HostLimits,
  type SignedGrant,
  type TimerPayloads,
} from "@cablejs/core";

import { ManualClock, type MemorySchedule } from "./clock.js";
import { MemoryHostRegistry } from "./registry.js";
import { MemoryConnection, MemorySocket } from "./socket.js";
import { MemoryStorage } from "./storage.js";

const DEFAULT_LIMITS: HostLimits = Object.freeze({
  attachmentBytes: 2_048,
  maxFrameBytes: 1_048_576,
});

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Promise rejection reasons are untyped at this task boundary and are normalized immediately.
function operationError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error("A memory Host operation failed.", { cause: reason });
}

class WorkQueue {
  private readonly background = new Set<Promise<void>>();
  private failure: Error | undefined;
  private tail: Promise<void> = Promise.resolve();

  run<Result>(operation: () => Promise<Result> | Result): Promise<Result> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  dispatch(operation: () => Promise<void> | void): void {
    const result = this.run(operation);
    this.tail = result.then(
      () => undefined,
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Promise rejection reasons are normalized into the queue's Error immediately.
      (error: unknown) => {
        this.failure ??= operationError(error);
      },
    );
  }

  track(promise: Promise<unknown>): void {
    const tracked = promise.then(
      () => undefined,
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Host.waitUntil accepts any Promise rejection reason, which is normalized immediately.
      (error: unknown) => {
        this.failure ??= operationError(error);
      },
    );
    this.background.add(tracked);
    void tracked.then(() => {
      this.background.delete(tracked);
      return undefined;
    });
  }

  async flush(): Promise<void> {
    let settled = false;
    while (!settled) {
      const tail = this.tail;
      // Work is intentionally drained in creation order, including tasks that
      // background promises enqueue while settling.
      // eslint-disable-next-line no-await-in-loop
      await tail;
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(this.background);
      settled = tail === this.tail && this.background.size === 0;
    }
    const failure = this.failure;
    this.failure = undefined;
    if (failure !== undefined) throw failure;
  }
}

/** Runtime and deterministic infrastructure used to construct a memory Host. */
export interface MemoryHostOptions extends EngineOptions {
  /** Shared manual time. Supply one clock to coordinate multiple Hosts. */
  readonly clock?: ManualClock;
  /** Canonical key for this channel instance. */
  readonly key: HostKey;
  /** Runtime byte limits. Defaults to Cloudflare-compatible limits. */
  readonly limits?: HostLimits;
  /** Shared peer registry. Supply one registry to route between multiple Hosts. */
  readonly registry?: MemoryHostRegistry;
}

/**
 * A deterministic in-process Host whose storage, sockets, and alarm survive
 * replacement of the channel engine.
 */
export interface MemoryHost extends Host {
  readonly clock: ManualClock;
  readonly storage: MemoryStorage;

  /** Advance shared time and drain all alarm and background work it creates. */
  advanceTime(milliseconds: number): Promise<void>;
  /** Start an in-memory WebSocket upgrade and return its browser-facing socket. */
  connect(request: Request, grant: SignedGrant): MemorySocket;
  /** Wait for queued socket, peer, alarm, and `waitUntil` work. */
  flush(): Promise<void>;
  /** Rebuild fresh engine handlers over the existing durable Host capabilities. */
  hibernate(): Promise<void>;
}

class MemoryHostRuntime<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads,
> implements MemoryHost {
  readonly clock: ManualClock;
  readonly key: HostKey;
  readonly limits: HostLimits;
  readonly peers: Host["peers"];
  readonly schedule: MemorySchedule;
  readonly storage = new MemoryStorage();
  private readonly autoResponses = new Map<string, string>();
  private readonly channel: TChannel;
  private readonly connectionsById = new Map<string, MemoryConnection>();
  private handlers: HostHandlers;
  private readonly implementation: ChannelImplementation<TChannel, TIdentity, TTimerPayloads>;
  private readonly options: MemoryHostOptions;
  private readonly queue = new WorkQueue();

  constructor(
    channel: TChannel,
    implementation: ChannelImplementation<TChannel, TIdentity, TTimerPayloads>,
    options: MemoryHostOptions,
  ) {
    this.channel = channel;
    this.implementation = implementation;
    this.options = options;
    this.clock = options.clock ?? new ManualClock();
    this.key = options.key;
    this.limits = options.limits ?? DEFAULT_LIMITS;
    const registry = options.registry ?? new MemoryHostRegistry();
    this.peers = registry.createPeers();
    this.schedule = this.clock.createSchedule(() => this.runAlarm());
    this.handlers = createEngine(channel, implementation, this, options);
    registry.register(this.key, {
      onPeer: (message) => this.queue.run(() => this.handlers.onPeer(message)),
    });
  }

  autoResponse(request: string, response: string): void {
    this.autoResponses.set(request, response);
  }

  connections(tag?: string): Iterable<Connection> {
    const connections = Array.from(this.connectionsById.values());
    return tag === undefined
      ? connections
      : connections.filter((connection) => connection.tags.includes(tag));
  }

  now(): number {
    return this.clock.now();
  }

  waitUntil(promise: Promise<unknown>): void {
    this.queue.track(promise);
  }

  async advanceTime(milliseconds: number): Promise<void> {
    await this.flush();
    await this.clock.advanceTime(milliseconds);
    await this.flush();
  }

  connect(request: Request, grant: SignedGrant): MemorySocket {
    const socket = new MemorySocket((operation) => {
      this.queue.dispatch(operation);
    });
    this.queue.dispatch(async () => {
      const result = await this.handlers.onUpgrade(request, grant);
      if (!result.accept) {
        socket.reject();
        return;
      }
      const connection = new MemoryConnection(
        result.attachment.cid,
        result.tags,
        result.attachment,
        socket,
        () => {
          this.connectionsById.delete(result.attachment.cid);
        },
        this.limits.attachmentBytes,
      );
      this.connectionsById.set(connection.id, connection);
      socket.accept({
        close: async (code, reason, wasClean) => {
          try {
            await this.handlers.onClose(connection, code, reason, wasClean);
          } finally {
            this.connectionsById.delete(connection.id);
          }
        },
        message: async (data) => {
          if (data instanceof ArrayBuffer) {
            await this.handlers.onMessage(connection, data);
            return;
          }
          const response = this.autoResponses.get(data);
          if (response === undefined) await this.handlers.onMessage(connection, data);
          else connection.send(response);
        },
        terminate: () => {
          this.connectionsById.delete(connection.id);
        },
      });
    });
    return socket;
  }

  flush(): Promise<void> {
    return this.queue.flush();
  }

  async hibernate(): Promise<void> {
    await this.flush();
    this.handlers = createEngine(this.channel, this.implementation, this, this.options);
    this.schedule.setHandler(() => this.runAlarm());
  }

  private runAlarm(): Promise<void> {
    return this.queue.run(() => this.handlers.onAlarm());
  }
}

/** Construct a memory Host and its first channel engine instance. */
export function createMemoryHost<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
>(
  channel: TChannel,
  implementation: ChannelImplementation<TChannel, TIdentity, TTimerPayloads>,
  options: MemoryHostOptions,
): MemoryHost {
  return new MemoryHostRuntime(channel, implementation, options);
}
