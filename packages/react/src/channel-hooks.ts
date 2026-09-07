import type { InferChannel, ChannelStatus, PresenceMember, Unsubscribe } from "@cablejs/client";
import type { InferServerEvent } from "@cablejs/contract";
import { hashKey } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

/** The current local and remote presence state for a channel. */
export interface ChannelPresenceSnapshot<Data, Input> {
  readonly self: Data | undefined;
  readonly others: readonly PresenceMember<Data>[];
  update(value: Input): void;
}

export interface PresenceHandle<Data, Input> {
  readonly presence: {
    readonly self: Data | undefined;
    readonly others: readonly PresenceMember<Data>[];
    update(value: Input): void;
    on(listener: () => void): Unsubscribe;
  };
}

const noPresenceMembers: readonly never[] = Object.freeze([]);
const serverStatus: ChannelStatus = "closed";
const serverPresence = Object.freeze({
  self: undefined,
  others: noPresenceMembers,
  update: () => undefined,
});

export interface ChannelHookHandle {
  readonly status: ChannelStatus;
  onStatus(listener: () => void): Unsubscribe;
}

/** Create a lazy channel handle and subscribe while this component is mounted. */
export function useChannel<Params, Handle extends ChannelHookHandle>(
  factory: (params: Params) => Handle,
  params: Params,
): Handle {
  const paramsKey = hashKey([params]);
  const handle = useMemo(() => factory(params), [factory, paramsKey]);

  useEffect(() => handle.onStatus(() => undefined), [handle]);
  return handle;
}

/** Subscribe to one server event and replace the listener when its callback changes. */
export function useEvent<Handle, Event extends keyof InferChannel<Handle>["server"] & string>(
  handle: Handle,
  event: Event,
  listener: (data: InferServerEvent<InferChannel<Handle>, Event>) => void,
): void;
export function useEvent(
  handle: { on(event: string, listener: (data: never) => void): Unsubscribe },
  event: string,
  listener: (data: never) => void,
): void {
  useEffect(() => handle.on(event, listener), [event, handle, listener]);
}

/** Read channel connection status with an SSR-stable closed snapshot. */
export function useChannelStatus(handle: ChannelHookHandle): ChannelStatus {
  const subscribe = useCallback((changed: () => void) => handle.onStatus(changed), [handle]);
  const snapshot = useCallback(() => handle.status, [handle]);
  return useSyncExternalStore(subscribe, snapshot, () => serverStatus);
}

/** Read and update channel presence with a stable snapshot for React. */
export function usePresence<Data, Input>(
  handle: PresenceHandle<Data, Input>,
): ChannelPresenceSnapshot<Data, Input> {
  const previous = useRef<ChannelPresenceSnapshot<Data, Input> | undefined>(undefined);
  const subscribe = useCallback((changed: () => void) => handle.presence.on(changed), [handle]);
  const update = useCallback(
    (value: Input) => {
      handle.presence.update(value);
    },
    [handle],
  );
  const snapshot = useCallback(() => {
    const { others, self } = handle.presence;
    const current = previous.current;
    if (
      current !== undefined &&
      current.self === self &&
      current.others === others &&
      current.update === update
    )
      return current;
    const next: ChannelPresenceSnapshot<Data, Input> = { self, others, update };
    previous.current = next;
    return next;
  }, [handle]);

  // SAFETY: SSR never opens a channel, so the empty snapshot is the only observable server state.
  return useSyncExternalStore(subscribe, snapshot, serverPresenceSnapshot<Data, Input>);
}

function serverPresenceSnapshot<Data, Input>(): ChannelPresenceSnapshot<Data, Input> {
  return serverPresence;
}
