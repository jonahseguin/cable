'use client';

import { useSock8Store } from './store';
import { ConnectionState } from '@sock8/sdk/client';
import type {
  ChannelTreeDefinition,
  ChannelEndpoint,
  GetOutputTypeFromEndpoint,
  ChannelTree,
} from '@sock8/sdk/dsl';
import { useSubscription } from './use-subscription';
import { useCallback, useMemo, useState } from 'react';

export const useChannel = <
  T extends ChannelTree<ChannelTreeDefinition, 'client'>,
  E extends ChannelEndpoint<T, 'client'>,
>(
  endpoint: E,
): {
  data: (GetOutputTypeFromEndpoint<E, 'client'> & { isOptimistic?: boolean | undefined })[];
  optimistic: {
    add: (data: GetOutputTypeFromEndpoint<E, 'client'>) => void;
  };
  isLoading: boolean;
} => {
  const connectionState = useSock8Store((state) => state.connectionState);
  const [data, setData] = useState<
    (GetOutputTypeFromEndpoint<E, 'client'> & { isOptimistic?: boolean })[]
  >([]);

  const handleMessage = useCallback((incoming: GetOutputTypeFromEndpoint<E, 'client'>) => {
    setData((prev) => {
      const withoutMatchingOptimistic = prev.filter((item) => {
        const a = { ...(item as Record<string, any>) };
        const b = { ...(incoming as Record<string, any>) };
        delete a.isOptimistic;
        return JSON.stringify(a) !== JSON.stringify(b);
      });

      return [
        ...withoutMatchingOptimistic,
        { ...(incoming as Record<string, any>), isOptimistic: false } as GetOutputTypeFromEndpoint<
          E,
          'client'
        > & { isOptimistic: boolean },
      ];
    });
  }, []);

  useSubscription(endpoint, handleMessage);

  const optimistic = useMemo(() => {
    return {
      add: (incomingData: GetOutputTypeFromEndpoint<E, 'client'>) => {
        setData((prev) => [
          ...prev,
          {
            ...(incomingData as Record<string, any>),
            isOptimistic: true,
          } as GetOutputTypeFromEndpoint<E, 'client'> & { isOptimistic: boolean },
        ]);
      },
    };
  }, []);

  const filteredData = useMemo(() => {
    const seen = new Set<string>();
    const deduped: (GetOutputTypeFromEndpoint<E, 'client'> & { isOptimistic?: boolean })[] = [];

    for (const item of data) {
      const clone = { ...(item as Record<string, any>) };
      delete clone.isOptimistic;

      const serialized = JSON.stringify(clone);

      if (!seen.has(serialized)) {
        seen.add(serialized);
        deduped.push(item);
      }
    }

    return deduped;
  }, [data]);

  return {
    data: filteredData,
    optimistic,
    isLoading: connectionState !== ConnectionState.CONNECTED,
  };
};
