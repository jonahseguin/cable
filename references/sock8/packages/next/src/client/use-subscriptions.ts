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

type SubscriptionPair<T extends ChannelEndpoint<ChannelTree<ChannelTreeDefinition, 'client'>>> = [
  T,
  (data: GetOutputTypeFromEndpoint<T, 'client'>) => void,
];

export function useSubscriptions<
  T extends ChannelTree<ChannelTreeDefinition, 'client'>,
  P extends readonly SubscriptionPair<ChannelEndpoint<T, 'client'>>[],
>(pairs: P): void {
  const manager = useSock8Store((state) => state.manager);

  // Store the latest versions of the handlers in refs
  const handlerRefs = useRef(
    pairs.map(([, handler]) => {
      const ref = { current: handler };
      return ref;
    }),
  );

  useEffect(() => {
    pairs.forEach(([, handler], i) => {
      handlerRefs.current[i]!.current = handler;
    });
  }, [pairs]);

  const resolvedPairs = useMemo(() => {
    if (!manager) return [];

    return pairs
      .map(([endpoint], i) => {
        const spec = endpoint as unknown as ChannelSpec;
        const channel = manager.resolveChannel(spec.staticPath, spec.params);
        if (!channel) return undefined;
        return [channel, handlerRefs.current[i]] as [string, { current: (data: unknown) => void }];
      })
      .filter((pair): pair is [string, { current: (data: unknown) => void }] => !!pair);
  }, [manager, pairs]);

  useEffect(() => {
    if (!manager) return;

    const unsubscribes = resolvedPairs.map(([channel, handlerRef]) => {
      const stableHandler = (data: unknown) => handlerRef.current(data);
      return manager.subscribe(channel, stableHandler);
    });

    return () => {
      for (const unsub of unsubscribes) {
        if (typeof unsub === 'function') unsub();
      }
    };
  }, [manager, resolvedPairs]);
}
