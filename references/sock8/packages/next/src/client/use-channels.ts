'use client';

import { useMemo, useState } from 'react';
import { useSock8Store } from './store';
import type {
  ChannelTreeDefinition,
  ChannelEndpoint,
  GetOutputTypeFromEndpoint,
  ChannelTree,
} from '@sock8/sdk/dsl';
import { ConnectionState } from '@sock8/sdk/client';
import { useSubscriptions } from './use-subscriptions';

export const useChannels = <
  T extends ChannelTree<ChannelTreeDefinition, 'client'>,
  const EM extends Record<string, ChannelEndpoint<T, 'client'>>,
>(
  endpoints: EM,
) => {
  const connectionState = useSock8Store((state) => state.connectionState);

  type Data = {
    [K in keyof EM]: (GetOutputTypeFromEndpoint<EM[K], 'client'> & { isOptimistic: boolean })[];
  };

  type OptimisticData = {
    [K in keyof EM]: {
      add: (data: GetOutputTypeFromEndpoint<EM[K], 'client'>) => void;
    };
  };

  const [data, setData] = useState<Data>(() => {
    const obj = {} as Data;
    for (const key in endpoints) {
      obj[key as keyof Data] = [];
    }
    return obj;
  });

  const optimistic = useMemo(() => {
    const obj = {} as OptimisticData;
    for (const key in endpoints) {
      obj[key as keyof OptimisticData] = {
        add: (incomingData) => {
          setData((prev) => ({
            ...prev,
            [key]: [
              ...prev[key as keyof Data],
              {
                ...(incomingData as Record<string, any>),
                isOptimistic: true,
              } as GetOutputTypeFromEndpoint<EM[typeof key], 'client'> & { isOptimistic: boolean },
            ],
          }));
        },
      };
    }
    return obj;
  }, [endpoints]);

  const handlers = useMemo(() => {
    const map = {} as {
      [K in keyof EM]: (incoming: GetOutputTypeFromEndpoint<EM[K], 'client'>) => void;
    };

    (Object.keys(endpoints) as (keyof EM)[]).forEach((key) => {
      map[key] = (incoming) => {
        setData((prev) => {
          const withoutMatchingOptimistic = prev[key].filter((item) => {
            const a = { ...(item as Record<string, any>) };
            const b = { ...(incoming as Record<string, any>) };
            delete a.isOptimistic;
            return JSON.stringify(a) !== JSON.stringify(b);
          });

          return {
            ...prev,
            [key]: [
              ...withoutMatchingOptimistic,
              {
                ...(incoming as Record<string, any>),
                isOptimistic: false,
              } as GetOutputTypeFromEndpoint<EM[typeof key], 'client'> & { isOptimistic: boolean },
            ],
          };
        });
      };
    });

    return map;
  }, [endpoints]);

  const pairs = useMemo(() => {
    return (Object.entries(endpoints) as [keyof EM, EM[keyof EM]][]).map(([key, endpoint]) => {
      const handler = handlers[key];
      return [endpoint, handler] as [typeof endpoint, typeof handler];
    });
  }, [endpoints, handlers]);

  useSubscriptions(pairs);

  const filteredData = useMemo(() => {
    return Object.keys(endpoints).reduce((acc, key) => {
      const items = data[key as keyof EM];
      const uniqueMessages = new Map<
        string,
        GetOutputTypeFromEndpoint<EM[keyof EM], 'client'> & { isOptimistic: boolean }
      >();
      const firstAppearanceIndex = new Map<string, number>();

      items.forEach((item, index) => {
        const { isOptimistic, ...content } = item as Record<string, any> & {
          isOptimistic: boolean;
        };
        const serialized = JSON.stringify(content);

        if (!firstAppearanceIndex.has(serialized)) {
          firstAppearanceIndex.set(serialized, index);
        }

        const existing = uniqueMessages.get(serialized);

        if (!existing) {
          uniqueMessages.set(
            serialized,
            item as GetOutputTypeFromEndpoint<EM[keyof EM], 'client'> & { isOptimistic: boolean },
          );
        } else if (existing.isOptimistic && !isOptimistic) {
          uniqueMessages.set(
            serialized,
            item as GetOutputTypeFromEndpoint<EM[keyof EM], 'client'> & { isOptimistic: boolean },
          );
        }
      });

      const finalMessages = Array.from(uniqueMessages.values());

      finalMessages.sort((a, b) => {
        const { isOptimistic: _isA, ...contentA } = a as Record<string, any> & {
          isOptimistic: boolean;
        };
        const { isOptimistic: _isB, ...contentB } = b as Record<string, any> & {
          isOptimistic: boolean;
        };
        const serializedA = JSON.stringify(contentA);
        const serializedB = JSON.stringify(contentB);
        return (
          (firstAppearanceIndex.get(serializedA) ?? Infinity) -
          (firstAppearanceIndex.get(serializedB) ?? Infinity)
        );
      });

      acc[key as keyof EM] = finalMessages as (GetOutputTypeFromEndpoint<EM[keyof EM], 'client'> & {
        isOptimistic: boolean;
      })[];
      return acc;
    }, {} as Data);
  }, [data, endpoints]);

  return {
    data: filteredData,
    optimistic,
    isLoading: connectionState !== ConnectionState.CONNECTED,
  };
};
