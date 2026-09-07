import type { AnyChannelContract } from "@cablejs/contract";
import { CableError } from "@cablejs/core";
import type { PresenceEntry, RpcCall } from "@cablejs/core";

import type { ChannelPool, ManagedChannel } from "./channel-pool.js";
import type { ChannelStatus, Unsubscribe } from "./channel-types.js";

const noMembers: readonly PresenceEntry[] = Object.freeze([]);

function isString(value: string | symbol): value is string {
  return typeof value === "string";
}
function isListener(value: RpcCall["input"]): value is (data: RpcCall["input"]) => void {
  return typeof value === "function";
}
function isAck(value: RpcCall["input"]): value is { readonly ack: true } {
  return typeof value === "object" && value !== null && "ack" in value && value.ack === true;
}

/** Runtime presence getters; contract inference supplies their public payload types. */
export interface RuntimePresence {
  readonly self: RpcCall["input"];
  readonly others: readonly PresenceEntry[];
  update(data: RpcCall["input"]): void;
  on(listener: () => void): Unsubscribe;
}

/** One independently disposable view of a shared channel connection. */
export class ChannelView {
  private readonly pool: ChannelPool;
  private readonly contract: AnyChannelContract;
  private readonly input: RpcCall["input"];
  private readonly subscriptions = new Set<Unsubscribe>();
  private readonly sessionOffs = new Set<Unsubscribe>();
  private readonly errors = new Set<(error: Error) => void>();
  private readonly statuses = new Set<() => void>();
  private managed: ManagedChannel | undefined;
  private acquiring: Promise<ManagedChannel> | undefined;
  private pooled = false;
  private leases = 0;
  private disposed = false;
  private failed = false;
  readonly presence: RuntimePresence;

  constructor(pool: ChannelPool, contract: AnyChannelContract, input: RpcCall["input"]) {
    this.pool = pool;
    this.contract = contract;
    this.input = input;
    // oxlint-disable-next-line typescript/no-this-alias -- Object getters have their own receiver; these getters read their owning channel view.
    const view = this;
    this.presence = {
      get self() {
        return view.managed?.self;
      },
      get others() {
        return view.managed?.others ?? noMembers;
      },
      update(data) {
        view.fire((managed) => managed.updatePresence(data));
      },
      on(listener) {
        return view.subscribe((managed) => managed.onPresence(listener));
      },
    };
  }

  get status(): ChannelStatus {
    if (this.disposed || this.failed) return "closed";
    if (this.pooled) return this.managed?.session.status ?? "connecting";
    return this.leases === 0 ? "closed" : "connecting";
  }

  readonly on = (event: string, listener: RpcCall["input"]): Unsubscribe => {
    if (!isListener(listener)) throw new TypeError("An event listener must be a function.");
    if (event !== "reset" && !Object.hasOwn(this.contract.server, event))
      throw new TypeError(`Unknown server event: ${event}`);
    return this.subscribe((managed) =>
      managed.session.onFrame((frame) => {
        if ((frame.t === "ev" || frame.t === "evt") && frame.ev === event) listener(frame.d);
        else if (
          event === "reset" &&
          frame.t === "welcome" &&
          frame.reset === true &&
          frame.more !== true
        )
          listener(undefined);
      }),
    );
  };

  readonly onStatus = (listener: () => void): Unsubscribe => {
    this.statuses.add(listener);
    return this.subscribe((managed) => {
      managed.session.start();
      return () => {
        this.statuses.delete(listener);
      };
    });
  };

  readonly onError = (listener: (error: Error) => void): Unsubscribe => {
    this.errors.add(listener);
    return () => {
      this.errors.delete(listener);
    };
  };

  readonly dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.subscriptions) off();
    this.subscriptions.clear();
    this.releasePool();
    this.changedStatus();
    this.statuses.clear();
    this.errors.clear();
  };

  proxy(): ChannelView {
    return new Proxy(this, {
      get: (_target, key) => {
        if (!isString(key) || key === "then") return undefined;
        switch (key) {
          case "on":
            return this.on;
          case "onStatus":
            return this.onStatus;
          case "onError":
            return this.onError;
          case "status":
            return this.status;
          case "dispose":
            return this.dispose;
          case "presence":
            return this.contract.presence === undefined ? undefined : this.presence;
          case "history":
            return this.contract.history === undefined
              ? undefined
              : { load: (input: RpcCall["input"] = {}) => this.call("history.load", input) };
          default:
            if (Object.hasOwn(this.contract.client, key))
              return (...args: RpcCall["input"][]) => this.send(key, args);
            if (Object.hasOwn(this.contract.procedures, key))
              return (input: RpcCall["input"]) => this.call(key, input);
            return undefined;
        }
      },
    });
  }

  private send(event: string, args: readonly RpcCall["input"][]): Promise<void> | void {
    const options = args[1];
    if (options !== undefined && !isAck(options))
      throw new TypeError("Event options must request ack: true.");
    if (isAck(options)) return this.acknowledge(event, args[0]);
    this.fire((managed) => managed.session.send({ t: "emit", ev: event, d: args[0] }));
  }

  private async acknowledge(event: string, input: RpcCall["input"]): Promise<void> {
    await this.temporary((managed) => managed.session.request({ t: "emit", ev: event, d: input }));
  }

  private async call(procedure: string, input: RpcCall["input"]): Promise<RpcCall["input"]> {
    return this.temporary((managed) => this.pool.call(managed, procedure, input));
  }

  private acquire(): Promise<ManagedChannel> {
    if (this.disposed)
      return Promise.reject(
        new CableError("UNAVAILABLE", { message: "Channel handle is disposed." }),
      );
    if (this.pooled && this.managed !== undefined) return Promise.resolve(this.managed);
    if (this.acquiring !== undefined) return this.acquiring;
    this.acquiring ??= this.pool
      .acquire(this.contract, this.input)
      .then((managed) => {
        if (this.disposed || this.leases === 0) {
          this.managed = managed;
          this.pool.release(managed);
        } else this.attach(managed);
        this.acquiring = undefined;
        return managed;
      })
      .catch((cause: unknown) => {
        this.acquiring = undefined;
        this.failed = true;
        this.changedStatus();
        throw cause;
      });
    return this.acquiring;
  }

  private attach(managed: ManagedChannel): void {
    this.managed = managed;
    this.pooled = true;
    this.sessionOffs.add(managed.session.onError(this.reportError));
    this.sessionOffs.add(managed.session.onStatus(this.changedStatus));
    this.changedStatus();
  }

  private lease(): Unsubscribe {
    if (this.disposed) return () => undefined;
    this.failed = false;
    this.leases += 1;
    return () => {
      if (this.leases === 0) return;
      this.leases -= 1;
      if (this.leases === 0) this.releasePool();
    };
  }

  private releasePool(): void {
    if (!this.pooled || this.managed === undefined) return;
    const managed = this.managed;
    this.pooled = false;
    for (const off of this.sessionOffs) off();
    this.sessionOffs.clear();
    this.pool.release(managed);
    this.changedStatus();
  }

  private async temporary<Result>(
    operation: (managed: ManagedChannel) => Result | Promise<Result>,
  ): Promise<Result> {
    const release = this.lease();
    try {
      const managed = await this.acquire();
      if (this.disposed) throw new CableError("UNAVAILABLE");
      return await operation(managed);
    } finally {
      release();
    }
  }

  private subscribe(attach: (managed: ManagedChannel) => Unsubscribe): Unsubscribe {
    const release = this.lease();
    let active = true;
    let detach: Unsubscribe | undefined;
    const off = (): void => {
      if (!active) return;
      active = false;
      detach?.();
      release();
      this.subscriptions.delete(off);
    };
    this.subscriptions.add(off);
    void this.acquire()
      .then((managed) => {
        if (!active || this.disposed) return undefined;
        detach = attach(managed);
        managed.session.start();
        return undefined;
      })
      .catch((cause: unknown) => {
        if (active && !this.disposed)
          this.reportError(cause instanceof Error ? cause : new CableError("UNAVAILABLE"));
      });
    return off;
  }

  private fire(operation: (managed: ManagedChannel) => void | Promise<void>): void {
    void this.temporary(operation).catch((cause: unknown) => {
      if (!this.disposed)
        this.reportError(cause instanceof Error ? cause : new CableError("UNAVAILABLE"));
    });
  }

  private readonly reportError = (error: Error): void => {
    for (const listener of this.errors) {
      try {
        listener(error);
      } catch {
        /* Error observers cannot replace the original failure. */
      }
    }
  };

  private readonly changedStatus = (): void => {
    for (const listener of this.statuses) {
      try {
        listener();
      } catch (cause) {
        this.reportError(cause instanceof Error ? cause : new Error("Status observer failed"));
      }
    }
  };
}
