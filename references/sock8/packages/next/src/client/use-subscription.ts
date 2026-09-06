'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useSock8Store } from './store';
import type {
  ChannelTreeDefinition,
  ChannelEndpoint,
  GetOutputTypeFromEndpoint,
  ChannelTree,
} from '@sock8/sdk/dsl';
import { type ChannelSpec } from '@sock8/sdk/client';

export const useSubscription = <
  T extends ChannelTree<ChannelTreeDefinition, 'client'>,
  E extends ChannelEndpoint<T, 'client'>,
>(
  endpoint: E,
  on: (data: GetOutputTypeFromEndpoint<E, 'client'>) => void,
) => {
  const manager = useSock8Store((state) => state.manager);

  const spec = endpoint as ChannelSpec;

  // Memoize the resolved channel to keep it stable.
  const resolvedChannel = useMemo(
    () => manager?.resolveChannel(spec.staticPath, spec.params),
    [manager, spec.staticPath, spec.params],
  );

  // Store the latest version of the callback in a stable ref.
  const onRef = useRef(on);
  useEffect(() => {
    onRef.current = on;
  }, [on]);

  // Create subscription once using a stable ref.
  useEffect(() => {
    if (!resolvedChannel || !manager) return;

    const stableCallback = (data: any) => {
      onRef.current(data);
    };

    const unsubscribe = manager.subscribe(resolvedChannel, stableCallback);

    // Clean up subscription on actual unmount.
    return () => unsubscribe();

    // Intentionally omitting `on` from deps array; using onRef to stabilize the callback.
  }, [resolvedChannel, manager]);

  return;
};
