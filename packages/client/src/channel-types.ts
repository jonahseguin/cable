import type {
  AnyChannelContract,
  InferClientEventInput,
  InferInput,
  InferOutput,
  InferPresence,
  InferSchemaInput,
  InferServerEvent,
} from "@cablejs/contract";

declare const subscriptionChannel: unique symbol;

/** Recover the channel node carried by a channel-handle type. */
export type InferChannel<Handle> = Handle extends {
  readonly [subscriptionChannel]?: infer Channel extends AnyChannelContract;
}
  ? Channel
  : never;

/** Connection state. Resuming lasts until the final replay chunk arrives. */
export type ChannelStatus = "connecting" | "open" | "resuming" | "closed";

/** Remove a listener. Calling it more than once has no effect. */
export type Unsubscribe = () => void;

/** Presence belongs to a connection, with an optional authenticated user ID. */
export interface PresenceMember<Data> {
  readonly cid: string;
  readonly uid?: string;
  readonly d: Data;
}

/** Local presence input and the latest server snapshot. */
export interface ChannelPresence<Channel extends AnyChannelContract> {
  readonly self: InferPresence<Channel> | undefined;
  readonly others: readonly PresenceMember<InferPresence<Channel>>[];
  update(value: InferSchemaInput<NonNullable<Channel["presence"]>>): void;
  on(listener: () => void): Unsubscribe;
}

/** Observe typed events and connection state while retaining a shared socket. */
export interface ChannelSubscription<Channel extends AnyChannelContract> {
  /** Type-only channel evidence retained when hooks infer from a subscription. */
  readonly [subscriptionChannel]?: Channel;
  readonly status: ChannelStatus;
  on<Event extends keyof Channel["server"] & string>(
    event: Event,
    listener: (data: InferServerEvent<Channel, Event>) => void,
  ): Unsubscribe;
  on(event: "reset", listener: () => void): Unsubscribe;
  onStatus(listener: () => void): Unsubscribe;
  onError(listener: (error: Error) => void): Unsubscribe;
  dispose(): void;
}

/** Named client events are methods; acknowledgement waits for the host response. */
export type ChannelSenders<Channel extends AnyChannelContract> = {
  readonly [Event in keyof Channel["client"] & string]: {
    (input: InferClientEventInput<Channel, Event>): void;
    (input: InferClientEventInput<Channel, Event>, options: { readonly ack: true }): Promise<void>;
  };
};

/** Host procedures resolve their declared output and may reject with CableError. */
export type ChannelProcedures<Channel extends AnyChannelContract> = {
  readonly [Name in keyof Channel["procedures"] & string]: (
    ...args: undefined extends InferInput<Channel["procedures"][Name]>
      ? [input?: InferInput<Channel["procedures"][Name]>]
      : [input: InferInput<Channel["procedures"][Name]>]
  ) => Promise<InferOutput<Channel["procedures"][Name]>>;
};

/** A refcounted view of one channel instance. Dispose releases only this view. */
export type ChannelHandle<Channel extends AnyChannelContract> = ChannelSubscription<Channel> &
  ChannelSenders<Channel> &
  ChannelProcedures<Channel> &
  (Channel["presence"] extends undefined
    ? Readonly<Record<never, never>>
    : { readonly presence: ChannelPresence<Channel> }) &
  (Channel["history"] extends undefined
    ? Readonly<Record<never, never>>
    : { readonly history: { load(input?: HistoryInput): Promise<ChannelHistoryPage<Channel>> } });

/** Runtime transport seam shared by browsers and deterministic memory tests. */
export interface ChannelSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener<Type extends keyof WebSocketEventMap>(
    type: Type,
    listener: (event: WebSocketEventMap[Type]) => void,
  ): void;
}

/** Retry and lifecycle limits for managed channel sockets. */
export interface SocketOptions {
  readonly createSocket?: (url: string) => ChannelSocket;
  readonly reconnect?: { readonly base?: number; readonly max?: number; readonly jitter?: boolean };
  readonly idleClose?: number;
  readonly requestTimeout?: number;
  readonly handshakeTimeout?: number;
  /** Optional sessionStorage-compatible cursor persistence; never stores credentials. */
  readonly cursors?: Pick<Storage, "getItem" | "setItem">;
}

/** A page before an exclusive sequence cursor, bounded to 100 entries by the host. */
export interface HistoryInput {
  readonly before?: number;
  readonly limit?: number;
}

/** A durable event with its append time and matching event payload. */
export type ChannelHistoryEvent<Channel extends AnyChannelContract> = {
  [Event in keyof Channel["server"] & string]: {
    readonly seq: number;
    readonly ev: Event;
    readonly d: InferServerEvent<Channel, Event>;
    readonly at: number;
  };
}[keyof Channel["server"] & string];

/** Events are ascending within each page; nextCursor requests the preceding page. */
export interface ChannelHistoryPage<Channel extends AnyChannelContract> {
  readonly events: readonly ChannelHistoryEvent<Channel>[];
  readonly nextCursor?: number;
}
