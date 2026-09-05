import type { AnyChannelContract } from "@cable/contract";
import { CableError } from "@cable/core";
import type { PresenceEntry, RpcCall } from "@cable/core";

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
  private readonly offs = new Set<Unsubscribe>();
  private readonly errors = new Set<(error: Error) => void>();
  private readonly statuses = new Set<() => void>();
  private managed: ManagedChannel | undefined;
  private acquiring: Promise<ManagedChannel> | undefined;
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
        view.fire((managed) => {
          managed.updatePresence(data);
        });
      },
      on(listener) {
        return view.subscribe((managed) => managed.onPresence(listener));
      },
    };
  }

  get status(): ChannelStatus {
    if (this.disposed || this.failed) return "closed";
    return this.managed?.session.status ?? (this.acquiring === undefined ? "closed" : "connecting");
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
    this.fire((managed) => {
      managed.session.start();
    });
    return () => {
      this.statuses.delete(listener);
    };
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
    for (const off of this.offs) off();
    this.offs.clear();
    if (this.managed !== undefined) this.pool.release(this.managed);
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
    this.fire((managed) => {
      managed.session.send({ t: "emit", ev: event, d: args[0] });
    });
  }

  private async acknowledge(event: string, input: RpcCall["input"]): Promise<void> {
    const managed = await this.acquire();
    await managed.session.request({ t: "emit", ev: event, d: input });
  }

  private async call(procedure: string, input: RpcCall["input"]): Promise<RpcCall["input"]> {
    return this.pool.call(await this.acquire(), procedure, input);
  }

  private acquire(): Promise<ManagedChannel> {
    if (this.disposed)
      return Promise.reject(
        new CableError("UNAVAILABLE", { message: "Channel handle is disposed." }),
      );
    this.acquiring ??= this.pool.acquire(this.contract, this.input).then((managed) => {
      if (this.disposed) {
        this.pool.release(managed);
        throw new CableError("UNAVAILABLE");
      }
      this.managed = managed;
      this.offs.add(managed.session.onError(this.reportError));
      this.offs.add(managed.session.onStatus(this.changedStatus));
      this.changedStatus();
      return managed;
    });
    return this.acquiring;
  }

  private subscribe(attach: (managed: ManagedChannel) => Unsubscribe): Unsubscribe {
    let active = true;
    let detach: Unsubscribe | undefined;
    const off = (): void => {
      active = false;
      detach?.();
      this.offs.delete(off);
    };
    this.offs.add(off);
    this.fire((managed) => {
      if (!active) return;
      detach = attach(managed);
      managed.session.start();
    });
    return off;
  }

  private fire(operation: (managed: ManagedChannel) => void): void {
    void this.acquire()
      .then(operation)
      .catch((cause: unknown) => {
        this.failed = this.managed === undefined;
        this.reportError(cause instanceof Error ? cause : new CableError("UNAVAILABLE"));
        this.changedStatus();
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
