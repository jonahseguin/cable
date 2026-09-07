import type {
  AnyChannelContract,
  AnyProcedureContract,
  InferChannelParams,
  InferSchemaInput,
  InferSchemaOutput,
} from "@cablejs/contract";

import type { ChannelWireError } from "../channel-protocol.js";
import type { GrantSecret } from "../grant.js";
import type { Connection, HostKey, Peers, Storage } from "../host.js";
import type { MaybePromise } from "../implementation.js";

/** Payload types for application-defined durable timers. */
export type TimerPayloads = object;

/** Parsed channel parameters, constrained to the canonical string route map. */
export type ChannelParams<TChannel extends AnyChannelContract> = InferChannelParams<TChannel> &
  Readonly<Record<string, string>>;

/** A connection target for a transient or durable server event. */
export type EventTarget = Connection | { readonly uid: string };

/** Controls whether a targeted event participates in durable replay. */
export interface EmitToOptions {
  readonly log?: boolean;
}

/** One retained event returned by the built-in history procedure. */
export type HistoryEvent<TChannel extends AnyChannelContract = AnyChannelContract> = {
  [TName in keyof TChannel["server"] & string]: {
    readonly at: number;
    readonly d: InferSchemaOutput<TChannel["server"][TName]>;
    readonly ev: TName;
    readonly seq: number;
    readonly t: "ev";
  };
}[keyof TChannel["server"] & string];

/** An ascending history page, read newest-first by page. */
export interface HistoryPage<TChannel extends AnyChannelContract = AnyChannelContract> {
  readonly events: readonly HistoryEvent<TChannel>[];
  readonly nextCursor?: number;
}

/** Input for the built-in `history.load` channel procedure. */
export interface HistoryLoadInput {
  /** Read events with a sequence below this cursor. Defaults to the current head plus one. */
  readonly before?: number;
  /** Maximum events returned. Defaults to 50 and cannot exceed 100. */
  readonly limit?: number;
}

/** Direct result returned by a host-to-host procedure call. */
export type PeerCallResult<TData> =
  | { readonly d: TData; readonly ok: true }
  | { readonly e: ChannelWireError; readonly ok: false };

/** Information supplied before an authenticated socket is accepted. */
export interface ChannelAuthorizeContext<TChannel extends AnyChannelContract, TIdentity> {
  readonly grants: readonly string[];
  readonly hostKey: HostKey;
  readonly identity: TIdentity;
  readonly params: ChannelParams<TChannel>;
  readonly request: Request;
  readonly uid?: string;
}

/** Shared capabilities available while application channel code executes. */
export interface ChannelContext<
  TChannel extends AnyChannelContract,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> {
  readonly hostKey: HostKey;
  readonly params: ChannelParams<TChannel>;
  readonly peers: Peers;
  readonly storage: Storage;
  connections(tag?: string): Iterable<Connection>;
  emit<TName extends keyof TChannel["server"] & string>(
    event: TName,
    data: InferSchemaInput<TChannel["server"][TName]>,
  ): Promise<number>;
  emitTo<TName extends keyof TChannel["server"] & string>(
    target: EventTarget,
    event: TName,
    data: InferSchemaInput<TChannel["server"][TName]>,
    options?: EmitToOptions,
  ): Promise<void>;
  now(): number;
  schedule<TKind extends keyof TTimerPayloads & string>(
    kind: TKind,
    at: number,
    args: TTimerPayloads[TKind],
  ): Promise<string>;
}

/** Context for a client event or connection lifecycle hook. */
export interface ChannelConnectionContext<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> extends ChannelContext<TChannel, TTimerPayloads> {
  readonly connection: Connection;
  readonly grants: readonly string[];
  readonly identity: TIdentity;
}

/** Connection context supplied after the socket has left the host. */
export interface ChannelDisconnectContext<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> extends ChannelConnectionContext<TChannel, TIdentity, TTimerPayloads> {
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
}

/** Context for a procedure invoked from a socket or another host. */
export interface ChannelProcedureContext<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> extends ChannelContext<TChannel, TTimerPayloads> {
  readonly connection?: Connection;
  readonly grants: readonly string[];
  readonly identity: TIdentity;
}

/** Context for an application timer, which has no connection identity. */
export type ChannelTimerContext<
  TChannel extends AnyChannelContract,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> = ChannelContext<TChannel, TTimerPayloads>;

/** Details passed to best-effort channel error reporting. */
export interface ChannelErrorContext {
  readonly connection?: Connection;
  readonly error: unknown;
  readonly operation: string;
}

/** Mapped client-event handlers with parsed Standard Schema inputs. */
export type ChannelClientHandlers<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> = {
  readonly [TName in keyof TChannel["client"] & string]: (
    context: ChannelConnectionContext<TChannel, TIdentity, TTimerPayloads>,
    input: InferSchemaOutput<TChannel["client"][TName]["input"]>,
  ) => MaybePromise<void>;
};

/** Mapped channel procedure handlers with parsed inputs and raw outputs. */
export type ChannelProcedureHandlers<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> = {
  readonly [
    TName in keyof TChannel["procedures"] & string
  ]: TChannel["procedures"][TName] extends infer TProcedure extends AnyProcedureContract
    ? (
        context: ChannelProcedureContext<TChannel, TIdentity, TTimerPayloads>,
        input: InferSchemaOutput<TProcedure["input"]>,
      ) => MaybePromise<InferSchemaInput<TProcedure["output"]>>
    : never;
};

/** Mapped application timer handlers. Timer payloads are application-owned types. */
export type ChannelTimerHandlers<
  TChannel extends AnyChannelContract,
  TTimerPayloads extends TimerPayloads,
> = {
  readonly [TKind in keyof TTimerPayloads & string]: (
    context: ChannelTimerContext<TChannel, TTimerPayloads>,
    args: TTimerPayloads[TKind],
  ) => MaybePromise<void>;
};

/** Typed application behavior for one channel family. */
export interface ChannelImplementation<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> {
  readonly authorize?: (
    context: ChannelAuthorizeContext<TChannel, TIdentity>,
  ) => MaybePromise<void>;
  readonly onClient: ChannelClientHandlers<TChannel, TIdentity, TTimerPayloads>;
  readonly onConnect?: (
    context: ChannelConnectionContext<TChannel, TIdentity, TTimerPayloads>,
  ) => MaybePromise<void>;
  readonly onDisconnect?: (
    context: ChannelDisconnectContext<TChannel, TIdentity, TTimerPayloads>,
  ) => MaybePromise<void>;
  readonly onError?: (context: ChannelErrorContext) => MaybePromise<void>;
  readonly procedures: ChannelProcedureHandlers<TChannel, TIdentity, TTimerPayloads>;
  readonly timers?: ChannelTimerHandlers<TChannel, TTimerPayloads>;
}

/** Runtime policy for one durable channel engine. */
export interface EngineOptions {
  /** Bytes already queued on a socket before the engine reconnects it for replay. */
  readonly backpressureBytes?: number;
  /** HMAC key used to verify short-lived edge grants. */
  readonly grantSecret: GrantSecret;
  /** Time allowed for the first hello frame. Defaults to 10 seconds. */
  readonly handshakeTimeoutMs?: number;
  /** How often durable presence is checked against live sockets. Defaults to 60 seconds. */
  readonly presenceSweepMs?: number;
  /** Identifier source. Defaults to `crypto.randomUUID`; injectable for deterministic tests. */
  readonly randomId?: () => string;
  /** Maximum encoded bytes in each welcome chunk. Defaults to 256 KiB. */
  readonly replayChunkBytes?: number;
  /** Resume-log count used when channel history is absent. Defaults to 1,000. */
  readonly resumeMaxEvents?: number;
  /** Resume-log age used when channel history is absent. Defaults to five minutes. */
  readonly resumeRetainMs?: number;
  /** Delay before retrying a failed durable timer. Defaults to one second. */
  readonly timerRetryMs?: number;
}
