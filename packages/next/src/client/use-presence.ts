'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSock8Store } from './store';
import type {
  ChannelTreeDefinition,
  ChannelEndpoint,
  ChannelTree,
  GetConfigFromEndpoint,
  ExtractPresenceSchema,
  KnownBuilderKeys,
  DefaultBuilderKey,
  GetPresenceSchemaFromEndpoint,
} from '@sock8/sdk/dsl';
import { ConnectionState, type ChannelSpec } from '@sock8/sdk/client';
import { z } from 'zod';
import { proxy, useSnapshot, subscribe, snapshot } from 'valtio';
import type { Snapshot } from 'valtio';

// --- Base Presence Data Type ---
type BasePresenceData<E> = z.infer<NonNullable<GetPresenceSchemaFromEndpoint<E>>>;

// --- Readonly Types for Hook Return (via useSnapshot) ---
type SelfPresence<E> = {
  readonly isConnected: boolean;
  readonly lastSeen: number;
  readonly data: Snapshot<BasePresenceData<E>>; // Data is a snapshot
};

type OtherPresence<E> = {
  readonly identity: string;
  readonly isConnected: boolean;
  readonly lastSeen: number;
  readonly data: Snapshot<BasePresenceData<E>>; // Data is a snapshot
};

// --- Mutable Types for Internal Valtio Proxy State ---
type MutableSelfPresence<E> = {
  isConnected: boolean;
  lastSeen: number;
  data: BasePresenceData<E>; // Data is mutable plain object
};

type MutableOtherPresence<E> = {
  identity: string;
  isConnected: boolean;
  lastSeen: number;
  data: BasePresenceData<E>; // Data is mutable plain object
};

// --- Raw Types (from backend) ---
type RawPresenceEntryValue = {
  isConnected: boolean;
  lastSeen: number;
  data: unknown;
};
type RawPresenceState = Record<string, RawPresenceEntryValue>;

// --- Hook Implementation ---

// Helper type to ensure endpoint has presence enabled
type PresenceEnabledChannelEndpoint<
  T extends ChannelTree<ChannelTreeDefinition, BuilderKey>,
  E extends ChannelEndpoint<T, BuilderKey>,
  BuilderKey extends KnownBuilderKeys = DefaultBuilderKey,
> = ExtractPresenceSchema<GetConfigFromEndpoint<E>> extends undefined ? never : E;

// Basic deep equal using JSON.stringify (use a library for robustness if needed)
function simpleDeepEqual(objA: any, objB: any): boolean {
  // Handle null/undefined cases first
  if (objA === null || objA === undefined || objB === null || objB === undefined) {
    return objA === objB;
  }

  // Directly compare the objects using stringify
  try {
    return JSON.stringify(objA) === JSON.stringify(objB);
  } catch {
    return false; // Stringify might fail on complex objects
  }
}

export const usePresence = <
  T extends ChannelTree<ChannelTreeDefinition, 'client'>,
  E extends ChannelEndpoint<T, 'client'>,
>(
  endpoint: PresenceEnabledChannelEndpoint<T, E, 'client'>,
): {
  // Return snapshot types
  readonly self: SelfPresence<E> | null;
  readonly others: readonly OtherPresence<E>[];
  readonly update: (data: Partial<BasePresenceData<E>>) => void;
  readonly connectionState: ConnectionState;
} => {
  const manager = useSock8Store((state) => state.manager);

  // --- Valtio State Proxy ---
  // Use useRef to keep the proxy instance stable across renders
  const state = useRef(
    proxy({
      self: null as MutableSelfPresence<E> | null,
      others: [] as MutableOtherPresence<E>[],
      connectionState: useSock8Store.getState().connectionState,
      _rawPresenceState: {} as RawPresenceState,
    }),
  ).current;

  // --- Sync Zustand Connection State to Valtio ---
  useEffect(() => {
    // Use subscribe(listener) form
    const unsub = useSock8Store.subscribe((newState, prevState) => {
      const newConnState = newState.connectionState;
      const oldConnState = prevState.connectionState;

      // Only update Valtio state if the Zustand state actually changed
      // AND it's different from the current Valtio state
      if (newConnState !== oldConnState && state.connectionState !== newConnState) {
        state.connectionState = newConnState;
      }
    });

    // Ensure initial state is correct after subscribing
    const currentConnState = useSock8Store.getState().connectionState;
    if (state.connectionState !== currentConnState) {
      state.connectionState = currentConnState;
    }
    return unsub;
  }, [state]);

  // Ref to store cached resolutions
  const serializedCacheRef = useRef<Map<string, string | null>>(new Map());

  // Memoize resolvedChannel based directly on endpoint prop and connection state
  const resolvedChannel = useMemo(() => {
    // Use endpoint prop directly
    const specFromProp = endpoint as ChannelSpec;

    if (state.connectionState !== ConnectionState.CONNECTED) {
      return null;
    }

    const currentPath = specFromProp.staticPath;
    const currentParams = specFromProp.params ?? {};
    // Create a stable key based on path and sorted param values
    const sortedParamKeys = Object.keys(currentParams).sort();
    const paramString = sortedParamKeys.map((key) => `${key}:${currentParams[key]}`).join(',');
    const serializedKey = `${currentPath}|${paramString}`;

    const cache = serializedCacheRef.current;

    if (cache.has(serializedKey)) {
      const cachedResult = cache.get(serializedKey);
      if (cachedResult) {
        return cachedResult;
      }
    }

    const newlyResolved = manager?.resolveChannel(currentPath, currentParams);

    cache.set(serializedKey, newlyResolved ?? null);
    return newlyResolved;
    // Depends on endpoint prop identity and connectionState
  }, [manager, endpoint, state.connectionState]);

  // --- Subscribe to Presence Updates ---
  useEffect(() => {
    // Depend on resolvedChannel and connectionState
    if (!manager || !resolvedChannel || state.connectionState !== ConnectionState.CONNECTED) {
      if (Object.keys(snapshot(state._rawPresenceState)).length > 0) {
        state._rawPresenceState = {};
      }
      return;
    }

    const handleUpdate = (updates: Record<string, unknown>, removals: string[]) => {
      // Mutate the existing state._rawPresenceState proxy directly
      try {
        // Apply removals first
        for (const identity of removals) {
          if (state._rawPresenceState[identity]) {
            // Check existence before delete
            delete state._rawPresenceState[identity];
          }
        }

        // Apply updates (add or merge)
        for (const [identity, partialUpdateUntyped] of Object.entries(updates)) {
          const partialUpdate = partialUpdateUntyped as Partial<RawPresenceEntryValue> & {
            data?: Partial<BasePresenceData<E>>;
          };
          const existingEntry = state._rawPresenceState[identity];

          if (existingEntry) {
            // Merge with existing entry
            const existingData = (existingEntry.data || {}) as object;
            const partialData = (partialUpdate.data || {}) as object;
            const mergedData = { ...existingData, ...partialData };

            // Mutate existing entry properties
            if (partialUpdate.isConnected !== undefined) {
              existingEntry.isConnected = partialUpdate.isConnected;
            }
            existingEntry.data = mergedData;
            existingEntry.lastSeen = Date.now(); // Always update lastSeen
          } else {
            // Add new entry (ensure structure)
            state._rawPresenceState[identity] = {
              isConnected: partialUpdate.isConnected ?? false,
              lastSeen: Date.now(),
              data: partialUpdate.data ?? {},
            };
          }
        }
      } catch (error) {
        console.error('[usePresence:handleUpdate] Error during mutation:', error);
      }
    };
    const unsubscribe = manager.subscribePresenceUpdate(resolvedChannel, handleUpdate);
    return () => {
      unsubscribe();
    };
    // Depend on resolvedChannel and connectionState
  }, [manager, resolvedChannel, state]); // Keep state dependency for connectionState check

  // --- Subscribe to Full Presence State ---
  useEffect(() => {
    // Depend on resolvedChannel and connectionState
    if (!manager || !resolvedChannel || state.connectionState !== ConnectionState.CONNECTED) {
      return;
    }

    const handleState = (newState: Record<string, unknown>) => {
      // Mutate existing proxy: clear it and add/update items IN PLACE
      try {
        const currentRawStateProxy = state._rawPresenceState; // Get reference to the proxy object
        const incomingIdentities = new Set(Object.keys(newState));

        // Remove identities from the *proxy* that are not in the new state
        for (const identity in currentRawStateProxy) {
          if (Object.prototype.hasOwnProperty.call(currentRawStateProxy, identity)) {
            if (!incomingIdentities.has(identity)) {
              delete currentRawStateProxy[identity];
              console.log(`[usePresence:handleState] Removed identity: ${identity}`);
            }
          }
        }

        // Add/Update identities from the new state directly onto the *proxy*
        for (const identity in newState) {
          if (Object.prototype.hasOwnProperty.call(newState, identity)) {
            // Check if data differs before assigning to potentially trigger fewer updates downstream
            // Although the parent subscribe() should handle this via compute's deepEqual.
            // This is more about direct mutation vs replacement.
            if (
              !currentRawStateProxy[identity] ||
              !simpleDeepEqual(currentRawStateProxy[identity], newState[identity])
            ) {
              currentRawStateProxy[identity] = newState[identity] as RawPresenceEntryValue;
            }
          }
        }
      } catch (error) {
        console.error('[usePresence:handleState] Error during mutation:', error);
      }
    };

    const unsubscribe = manager.subscribePresenceState(resolvedChannel, handleState);
    manager.getPresence(resolvedChannel);
    return () => {
      unsubscribe();
    };
    // Depend on resolvedChannel and connectionState
  }, [manager, resolvedChannel, state]); // Keep state dependency for connectionState check

  // --- Derive Self and Others State from Raw State ---
  useEffect(() => {
    const computeAndUpdateDerivedState = () => {
      const currentRawState = snapshot(state._rawPresenceState);
      const currentSelfIdentity = manager?.identity ?? null;

      // --- Calculate new self state ---
      let newSelf: MutableSelfPresence<E> | null = null;
      if (currentSelfIdentity && currentRawState[currentSelfIdentity]) {
        const selfEntry = currentRawState[currentSelfIdentity];
        if (selfEntry.isConnected) {
          newSelf = {
            isConnected: true,
            lastSeen: selfEntry.lastSeen,
            data: selfEntry.data as BasePresenceData<E>,
          };
        }
      }

      // --- Calculate new others state ---
      const newOthersCalculated: MutableOtherPresence<E>[] = [];
      const newOthersIdentities = new Set<string>();
      if (currentSelfIdentity) {
        for (const [identity, entryValue] of Object.entries(currentRawState)) {
          if (identity !== currentSelfIdentity && entryValue.isConnected) {
            newOthersCalculated.push({
              identity,
              isConnected: true,
              lastSeen: entryValue.lastSeen,
              data: entryValue.data as BasePresenceData<E>,
            });
            newOthersIdentities.add(identity);
          }
        }
      }

      // --- Update Self State (with comparison) ---
      const currentStateSnapshot = snapshot(state);
      if (!simpleDeepEqual(currentStateSnapshot.self, newSelf)) {
        state.self = newSelf;
      }

      // --- Update Others State (Refined Granular Mutation) ---
      const currentOthersProxy = state.others; // Direct reference to the proxy array

      // 1. Update existing or add new
      for (const newOther of newOthersCalculated) {
        const existingIndex = currentOthersProxy.findIndex((o) => o.identity === newOther.identity);
        if (existingIndex !== -1) {
          // Found existing - mutate in place
          const existingOtherProxy = currentOthersProxy[existingIndex];
          if (existingOtherProxy) {
            // Replace data object if deeply unequal
            if (!simpleDeepEqual(existingOtherProxy.data, newOther.data)) {
              existingOtherProxy.data = newOther.data; // Assign new data object reference
            }
            // Check if lastSeen needs update
            if (existingOtherProxy.lastSeen !== newOther.lastSeen) {
              existingOtherProxy.lastSeen = newOther.lastSeen;
            }
          }
        } else {
          // Add new member
          currentOthersProxy.push(newOther);
        }
      }

      // 2. Remove stale members
      const currentLength = currentOthersProxy.length; // Get length AFTER potential additions
      for (let i = currentLength - 1; i >= 0; i--) {
        const currentIdentity = currentOthersProxy[i]?.identity;
        if (currentIdentity && !newOthersIdentities.has(currentIdentity)) {
          currentOthersProxy.splice(i, 1);
        }
      }
    };
    const unsubProxy = subscribe(state, () => {
      computeAndUpdateDerivedState();
    });
    const unsubZustand = useSock8Store.subscribe((newState, prevState) => {
      const newId = newState.manager?.identity;
      const oldId = prevState.manager?.identity;
      if (newId !== oldId) {
        computeAndUpdateDerivedState(); // Explicitly recompute on identity change
      }
    });
    computeAndUpdateDerivedState();
    return () => {
      unsubProxy();
      unsubZustand();
    };
  }, [state, manager]); // Keep dependencies simple

  // --- Memoized Update Function ---
  const update = useCallback(
    (data: Partial<BasePresenceData<E>>) => {
      if (state.connectionState !== ConnectionState.CONNECTED) {
        console.warn('[usePresence] Cannot update presence, not connected.');
        return;
      }
      const currentSelfIdentity = manager?.identity;
      if (!manager || !resolvedChannel || !currentSelfIdentity) {
        console.warn(
          '[usePresence] Cannot update presence, manager, channel, or self identity not ready.',
          { hasManager: !!manager, resolvedChannel, currentSelfIdentity },
        );
        return;
      }

      // --- Optimistic Update (Raw State Only, constructing complete data) ---

      // 1. Get the current derived self state snapshot (best local knowledge)
      const currentSelfSnapshot = state.self ? snapshot(state.self) : null;

      // 2. Construct the *complete* data payload for the optimistic update
      //    Start with existing derived data (if any), then merge the partial update.
      const completeNewData = {
        ...(currentSelfSnapshot?.data ?? {}), // Start with existing derived data
        ...data, // Apply the partial changes
      } as BasePresenceData<E>; // Assume result matches the full base type

      // 3. Create the new RawPresenceEntryValue using the complete data
      const newSelfRawValue: RawPresenceEntryValue = {
        isConnected: true, // Assume connected for optimistic update
        lastSeen: Date.now(),
        data: completeNewData, // Use the fully merged data
      };

      // 4. Mutate the raw state proxy *in place*
      //    This ensures we don't replace the proxy object reference.
      if (state._rawPresenceState[currentSelfIdentity]) {
        // Update existing entry properties
        const existingEntry = state._rawPresenceState[currentSelfIdentity];
        existingEntry.isConnected = newSelfRawValue.isConnected;
        existingEntry.lastSeen = newSelfRawValue.lastSeen;
        existingEntry.data = newSelfRawValue.data;
      } else {
        // Add new entry directly to the proxy
        state._rawPresenceState[currentSelfIdentity] = newSelfRawValue;
      }

      // --- Send *original partial* update to server ---
      manager.setPresence(resolvedChannel, data); // Send only the changes
    },
    [manager, resolvedChannel, state], // state ref is stable
  );

  // --- Create Snapshot ---
  // Call useSnapshot here inside the hook
  const snap = useSnapshot(state);

  // --- Return Snapshot values and update function ---
  return {
    self: snap.self,
    others: snap.others,
    connectionState: snap.connectionState,
    update,
  };
};
