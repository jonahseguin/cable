import type { z } from 'zod';
import {
  type ConnectionManager,
  ConnectionState,
  Sock8ConnectionManager,
  type ConnectionConfig,
} from './lib/connection';
import { createChannelProxy, type ChannelSpec } from './lib/proxy';

// Import types from common
import type {
  ChannelTree,
  ChannelTreeDefinition,
  ChannelHandler,
  Unsubscribe,
  ApplyChannelMethodBuilder,
  DefaultBuilderKey,
  ExtractPresenceSchema,
  ChannelConfig,
} from '@/common';

export type { ChannelHandler, Unsubscribe } from '@/common';

export type { ConnectionManager, ConnectionConfig } from './lib/connection';
export { ConnectionState, Sock8ConnectionManager } from './lib/connection';
export type { ChannelSpec } from './lib/proxy';

export interface ClientOptions {
  connection: ConnectionManager;
}

/**
 * Creates a sock8 client instance with connection-aware channel functionality.
 *
 * @param options Client configuration options.
 * @param ServerTree Pass the type representing your *server* channel structure
 *                   (e.g., typeof serverTree) to get full type safety and autocompletion
 *                   on the resulting client tree.
 * @returns A typed client object for interacting with channels, mirroring the
 *          server structure but with client-specific methods.
 */
export function createProxyClient<ServerTree extends ChannelTree<ChannelTreeDefinition, any>>(
  options?: ClientOptions,
): ServerTree extends ChannelTree<infer Config, any> ? ChannelTree<Config, 'client'> : never {
  const baseProxy = createChannelProxy<any>();

  if (!options) {
    return baseProxy as any;
  }

  const createHandler = () => ({
    get(target: any, prop: string | symbol) {
      const value = Reflect.get(target, prop);

      if ((prop === 'subscribe' || prop === 'on') && typeof value === 'function') {
        return function clientSubscribeWrapper<T>(handler: ChannelHandler<T>): Unsubscribe {
          console.log(`Runtime: Attempting to subscribe via wrapper for prop: ${String(prop)}`);
          return () => {};
        };
      }

      if (prop === 'for' && typeof value === 'function') {
        return function forWithWrapping(...args: any[]) {
          const result = value.apply(target, args);
          return new Proxy(result, createHandler());
        };
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return new Proxy(value, createHandler());
      }

      return value;
    },
  });

  return new Proxy(baseProxy, createHandler()) as any;
}

type ClientChannelMethods<Schema extends z.ZodType, OutputType, Config extends ChannelConfig> = {
  config: Config;
};

declare module '@/common' {
  interface ApplyChannelMethodBuilder<
    BuilderKey extends string,
    Schema extends z.ZodType,
    OutputType,
    Config extends ChannelConfig,
  > {
    client: ClientChannelMethods<Schema, OutputType, Config>;
  }
}
