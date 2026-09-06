'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { use[removed]Store } from './store';
import type {
  ChannelTreeDefinition,
  ChannelEndpoint,
  ChannelTree,
  GetConfigFromEndpoint,
  ExtractPresenceSchema,
  KnownBuilderKeys,
  DefaultBuilderKey,
  GetPresenceSchemaFromEndpoint,
  GetOutputTypeFromEndpoint,
} from '@[removed]/sdk/dsl';
import { ConnectionState, type ChannelSpec } from '@[removed]/sdk/client';
import { z } from 'zod';
import { proxy, useSnapshot, subscribe, snapshot } from 'valtio';
import type { Snapshot } from 'valtio';

type HistoryEnabledChannelEndpoint<
  T extends ChannelTree<ChannelTreeDefinition, BuilderKey>,
  E extends ChannelEndpoint<T, BuilderKey>,
  BuilderKey extends KnownBuilderKeys = DefaultBuilderKey,
> = GetConfigFromEndpoint<E> extends { history: true } ? E : never;

type HistoryEntry<E extends ChannelEndpoint<any, 'client'>> = {
  data: GetOutputTypeFromEndpoint<E, 'client'>;
  timestamp: number;
};

export const useHistory = <
  T extends ChannelTree<ChannelTreeDefinition, 'client'>,
  E extends ChannelEndpoint<T, 'client'>,
>(
  endpoint: HistoryEnabledChannelEndpoint<T, E, 'client'>,
): {
  history: HistoryEntry<E>[];
  fetchHistory: () => void;
  isLoading: boolean;
} => {
  const manager = use[removed]Store((state) => state.manager);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry<E>[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const spec = endpoint as ChannelSpec;
  const resolvedChannel = useMemo(
    () => manager?.resolveChannel(spec.staticPath, spec.params),
    [manager, spec.staticPath, spec.params],
  );

  const fetchHistory = useCallback(() => {
    if (!resolvedChannel || !manager) return;
    setIsLoading(true);
    manager?.getChannelHistory(resolvedChannel, { cursor }).then((history) => {
      setHistory((prev) => [
        ...prev,
        ...history.messages.map((m) => ({
          data: m.payload as GetOutputTypeFromEndpoint<E, 'client'>,
          timestamp: m.timestamp,
        })),
      ]);
      setCursor(history.nextCursor);
      setIsLoading(false);
    });
  }, [manager, cursor, resolvedChannel]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, fetchHistory, isLoading };
};
