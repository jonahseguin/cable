/**
 * This file exports utilities that are only intended for testing.
 * These should not be used in production code.
 */

import { ConnectionState, type ConnectionManager } from './lib/connection';
import type {
  ChannelHandler,
  Unsubscribe,
  ChannelTree,
  ChannelTreeDefinition,
  ChannelEndpoint,
} from '@/common';
import { resolveEndpointFromTree } from '@/server';
import { vi } from 'vitest';

// Mock presence data structure used internally by the mock manager
type MockPresenceState = Record<string, { data: unknown; isConnected: boolean; lastSeen: number }>;

/**
 * A mock implementation of ConnectionManager for testing
 */
export class MockConnectionManager<TChannels extends ChannelTree<ChannelTreeDefinition>>
  implements ConnectionManager
{
  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private _identity: string | null = null;
  private subscriptions: Map<string, Set<ChannelHandler<unknown>>> = new Map();
  private presenceStateSubscriptions = new Map<
    string,
    Set<(state: Record<string, unknown>) => void>
  >();
  private presenceUpdateSubscriptions = new Map<
    string,
    Set<(updates: Record<string, unknown>, removals: string[]) => void>
  >();
  private authorizedChannels: Set<string> = new Set();
  private channelTree: TChannels;

  // Internal mock state for presence
  private mockChannelPresence: Map<string, MockPresenceState> = new Map();

  constructor(options: {
    channelTree: TChannels;
    initialState?: ConnectionState;
    authorizedChannels?: Array<ChannelEndpoint<TChannels>>;
    identity?: string | null; // Allow setting initial identity
  }) {
    this.channelTree = options.channelTree;
    this._identity = options.identity ?? null;

    if (options.initialState) {
      this._state = options.initialState;
    }

    // Process authorized channels if provided
    if (options.authorizedChannels && Array.isArray(options.authorizedChannels)) {
      this.authorizeChannels(options.authorizedChannels);
    }
  }

  get state(): ConnectionState {
    return this._state;
  }

  get identity(): string | null {
    return this._identity;
  }

  async connect(): Promise<void> {
    this._state = ConnectionState.CONNECTED;
    // Typically identity would be set upon successful connection/auth
    // For mock, ensure it's set if not provided initially.
    if (!this._identity) {
      this._identity = `mock-identity-${Math.random().toString(36).substring(7)}`;
    }
  }

  disconnect(): void {
    this._state = ConnectionState.DISCONNECTED;
    this._identity = null; // Clear identity on disconnect
  }

  /**
   * Authorize channels using DSL objects
   * Example:
   * authorizeChannels([
   *   channels.notifications.for({ userId: "123" }),
   *   channels.chat.messages.for({ roomId: "room-1" })
   * ])
   */
  authorizeChannels(channelProxies: Array<ChannelEndpoint<TChannels>>): void {
    for (const proxy of channelProxies) {
      try {
        if (proxy && typeof proxy === 'object') {
          // Channel objects have __channelId__ property that contains the full resolved channel path
          const channelId = (proxy as any).__channelId__;
          if (typeof channelId === 'string') {
            this.authorizedChannels.add(channelId);
            continue;
          }

          // If __channelId__ not found, we can try to use resolveEndpointFromTree
          // with the object properties, but this is just a fallback
          const asAny = proxy as any;
          if (
            asAny &&
            typeof asAny.staticPath === 'string' &&
            asAny.params &&
            typeof asAny.params === 'object'
          ) {
            try {
              const resolvedChannel = resolveEndpointFromTree(
                this.channelTree,
                asAny.staticPath,
                asAny.params || {},
              );

              if (resolvedChannel) {
                this.authorizedChannels.add(resolvedChannel);
              }
            } catch (error) {
              console.warn(`Failed to resolve channel for path: ${asAny.staticPath}`);
            }
          }
        }
      } catch (error) {
        console.error(
          'Error authorizing channel:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  resolveChannel(
    staticPath: string,
    params: Record<string, string | number | boolean>,
  ): string | null {
    try {
      // Convert params to string values if needed
      const stringParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(params)) {
        stringParams[key] = String(value);
      }

      // Use the server's resolveEndpointFromTree with the static path and params
      const resolvedChannel = resolveEndpointFromTree(this.channelTree, staticPath, stringParams);

      // Check if this channel is authorized
      if (resolvedChannel && this.authorizedChannels.has(resolvedChannel)) {
        return resolvedChannel;
      }

      // If not in authorized channels but resolvable, recommend adding it
      if (resolvedChannel) {
        console.warn(
          `Channel "${resolvedChannel}" was resolved but not authorized. ` +
            `Use authorizeChannels() with the appropriate channel DSL objects to authorize it.`,
        );
      }

      console.warn(`No matching authorized channel found for ${staticPath} with params:`, params);
      return null;
    } catch (error) {
      console.error(
        'Error resolving channel:',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  subscribe<T>(channelPath: string, handler: ChannelHandler<T>): Unsubscribe {
    if (!this.subscriptions.has(channelPath)) {
      this.subscriptions.set(channelPath, new Set());
    }

    // Safe to cast here because we're adding the handler to the set
    const handlers = this.subscriptions.get(channelPath)!;
    handlers.add(handler as unknown as ChannelHandler<unknown>);

    // Return a properly typed unsubscribe function
    return () => {
      const handlers = this.subscriptions.get(channelPath);
      if (handlers) {
        handlers.delete(handler as unknown as ChannelHandler<unknown>);
        if (handlers.size === 0) {
          this.subscriptions.delete(channelPath);
        }
      }
    };
  }

  // Helper method for testing
  simulateIncomingMessage<T>(channelPath: string, payload: T): void {
    const handlers = this.subscriptions.get(channelPath);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          // Cast is safe here because we're calling the handler with the payload
          (handler as unknown as ChannelHandler<T>)(payload);
        } catch (error) {
          console.error(
            `Error in handler for "${channelPath}":`,
            error instanceof Error ? error.message : String(error),
          );
        }
      });
    }
  }

  // --- Mock Presence Methods ---

  setPresence = vi.fn((channel: string, data: unknown): void => {
    if (this.state !== ConnectionState.CONNECTED) {
      console.warn('[MockConnectionManager] Cannot setPresence, not connected.');
      return;
    }
    if (!this.identity) {
      console.warn('[MockConnectionManager] Cannot setPresence, identity unknown.');
      return;
    }
    console.log(`[MockConnectionManager] MOCK setPresence called for ${channel}`, data);

    // Simulate updating internal state (optional)
    let channelState = this.mockChannelPresence.get(channel);
    if (!channelState) {
      channelState = {};
      this.mockChannelPresence.set(channel, channelState);
    }
    channelState[this.identity] = {
      data,
      isConnected: true,
      lastSeen: Date.now(),
    };

    // Optionally simulate the update broadcast back via simulateIncomingPresenceUpdate
    // this.simulateIncomingPresenceUpdate(channel, {[this.identity]: channelState[this.identity]}, []);
  });

  getPresence = vi.fn((channel: string): void => {
    if (this.state !== ConnectionState.CONNECTED) {
      console.warn('[MockConnectionManager] Cannot getPresence, not connected.');
      return;
    }
    console.log(`[MockConnectionManager] MOCK getPresence called for ${channel}`);
    // Optionally simulate receiving the full state via simulateIncomingPresenceState
    // const state = this.mockChannelPresence.get(channel) ?? {};
    // this.simulateIncomingPresenceState(channel, state);
  });

  subscribePresenceState = vi.fn(
    (channel: string, handler: (state: Record<string, unknown>) => void): Unsubscribe => {
      if (!this.presenceStateSubscriptions.has(channel)) {
        this.presenceStateSubscriptions.set(channel, new Set());
      }
      const handlers = this.presenceStateSubscriptions.get(channel)!;
      handlers.add(handler);
      console.log(`[MockConnectionManager] MOCK subscribePresenceState for ${channel}`);
      return () => {
        const handlers = this.presenceStateSubscriptions.get(channel);
        handlers?.delete(handler);
        if (handlers?.size === 0) this.presenceStateSubscriptions.delete(channel);
        console.log(`[MockConnectionManager] MOCK unsubscribePresenceState for ${channel}`);
      };
    },
  );

  subscribePresenceUpdate = vi.fn(
    (
      channel: string,
      handler: (updates: Record<string, unknown>, removals: string[]) => void,
    ): Unsubscribe => {
      if (!this.presenceUpdateSubscriptions.has(channel)) {
        this.presenceUpdateSubscriptions.set(channel, new Set());
      }
      const handlers = this.presenceUpdateSubscriptions.get(channel)!;
      handlers.add(handler);
      console.log(`[MockConnectionManager] MOCK subscribePresenceUpdate for ${channel}`);
      return () => {
        const handlers = this.presenceUpdateSubscriptions.get(channel);
        handlers?.delete(handler);
        if (handlers?.size === 0) this.presenceUpdateSubscriptions.delete(channel);
        console.log(`[MockConnectionManager] MOCK unsubscribePresenceUpdate for ${channel}`);
      };
    },
  );

  // --- Helper Methods for Testing ---

  // Simulate incoming presence state message
  simulateIncomingPresenceState(channel: string, state: Record<string, unknown>): void {
    console.log(`[MockConnectionManager] Simulating incoming presenceState for ${channel}`);
    const handlers = this.presenceStateSubscriptions.get(channel);
    handlers?.forEach((handler) => {
      try {
        handler(state);
      } catch (e) {
        console.error(`Error in mock presenceState handler for ${channel}`, e);
      }
    });
  }

  // Simulate incoming presence update message
  simulateIncomingPresenceUpdate(
    channel: string,
    updates: Record<string, unknown>,
    removals: string[],
  ): void {
    console.log(`[MockConnectionManager] Simulating incoming presenceUpdate for ${channel}`);
    const handlers = this.presenceUpdateSubscriptions.get(channel);
    handlers?.forEach((handler) => {
      try {
        handler(updates, removals);
      } catch (e) {
        console.error(`Error in mock presenceUpdate handler for ${channel}`, e);
      }
    });
  }

  // Set the connection state manually for testing
  setConnectionState(state: ConnectionState): void {
    this._state = state;
  }

  // Manually set the identity for testing
  setIdentity(identity: string | null): void {
    this._identity = identity;
  }
}
