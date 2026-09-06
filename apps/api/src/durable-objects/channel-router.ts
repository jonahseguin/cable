/**
 * ChannelRouter Durable Object
 *
 * Manages the routing of WebSocket connections to appropriate shards using consistent hashing.
 * This object maintains a global view of all channels and their associated shards to enable:
 *
 * - Load balancing across shards
 * - Channel-aware routing
 * - Connection tracking per shard
 */
import { DurableObject } from 'cloudflare:workers';
import { ConsistentHash } from '../utils/consistent-hash';
import { getActiveRegions } from '../utils/region';
import type {
  ChannelLookup,
  ChannelRegistration,
  ShardAssignment,
  ShardConnections,
  PresenceEntry,
  ChannelRouterMethods,
} from '../types';
import { DO_PREFIX } from '../constants';

// Analytics Imports
import {
  sendEvent,
  trackChannelRegistered,
  trackChannelUnregistered,
  trackErrorOccurred,
} from '../services/analytics-service';
import { Logger, LogLevel } from '../utils/logger';

const SHARD_METADATA_KEY = 'shard_metadata';
const AGGREGATION_INTERVAL_SECONDS = 60; // Aggregate analytics every 60 seconds

const ROUTER_METADATA_KEY = 'router_metadata'; // Storage key for router metadata
const ACTIVE_REGIONS_CACHE_KEY = 'active_regions_cache'; // Storage key for cached regions
const REGION_CACHE_TTL_MS = 30 * 1000; // Cache active regions for 30 seconds

/**
 * ChannelRouter coordinates the global distribution of WebSocket connections
 * across shards using consistent hashing to maximize locality.
 */
export class ChannelRouter extends DurableObject<Env> implements ChannelRouterMethods {
  // Maps channels to their associated shards
  #channelToShards = new Map<string, Set<string>>();

  // Consistent hash rings for each channel
  #hashRings = new Map<string, ConsistentHash>();

  // Connection counts per shard
  #shardConnectionCounts = new Map<string, number>();

  // Router Metadata & Logger
  #organizationId: string | undefined;
  #region: string | undefined;
  #routerId: string;
  #logger: Logger;

  // --- Region Cache State ---
  #activeRegionsCache = new Set<string>();
  #lastRegionCacheUpdate = 0;
  // --------------------------

  // --- Presence State (Local Cache) ---
  #channelPresence = new Map<string, Map<string, PresenceEntry>>();

  constructor(
    readonly state: DurableObjectState,
    readonly env: Env,
  ) {
    super(state, env);
    this.#routerId = this.state.id.toString();

    // Initialize Logger with base context (ID only)
    this.#logger = new Logger({
      minLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
      context: {
        doClass: 'ChannelRouter',
        doIdShort: this.#routerId.slice(0, 8),
      },
    });

    this.state.blockConcurrencyWhile(async () => {
      // Load persisted state (channels, rings, counts)
      await this.#loadState();
      // Attempt to load metadata persisted by initialize()
      await this.#loadMetadata();
      // Load cached regions
      await this.#loadRegionCache();
    });
  }

  /**
   * Loads the durable object state from storage
   */
  async #loadState(): Promise<void> {
    try {
      // Load channel to shard mappings (from full map write)
      const channelMappings = await this.state.storage.get<[string, string[]][]>('channelToShards');
      if (channelMappings) {
        this.#channelToShards.clear(); // Clear before loading
        for (const [channel, shardList] of channelMappings) {
          this.#channelToShards.set(channel, new Set(shardList));
        }
      }

      // Initialize consistent hash rings for channels (from full map write)
      const storedHashRings = await this.state.storage.get<[string, string[]][]>('hashRings');
      if (storedHashRings) {
        this.#hashRings.clear(); // Clear before loading
        for (const [channel, shards] of storedHashRings) {
          this.#hashRings.set(channel, new ConsistentHash(shards));
        }
      }

      // Load shard connection counts using prefix (granular)
      const storedCounts = await this.state.storage.list<number>({ prefix: 'count:' });
      this.#shardConnectionCounts.clear(); // Clear before loading
      for (const [key, count] of storedCounts) {
        const shardId = key.slice('count:'.length);
        if (shardId && typeof count === 'number') {
          this.#shardConnectionCounts.set(shardId, count);
        } else {
          this.#logger.warn('Skipping invalid granular count entry from storage', { key });
        }
      }

      this.#logger.debug(
        `Router state loaded from storage. Channels: ${this.#channelToShards.size}, Shards: ${this.#shardConnectionCounts.size}`,
      );
    } catch (err) {
      this.#logger.error('Failed to load router state from storage', err);
      // Cannot track reliably here as metadata (orgId, region) might not be loaded yet.
    }
  }

  /**
   * Loads OrgId and Region from storage if previously initialized
   */
  async #loadMetadata(): Promise<void> {
    if (this.#organizationId && this.#region) return; // Already loaded/set

    try {
      const meta = await this.state.storage.get<{ orgId: string; region: string }>(
        ROUTER_METADATA_KEY,
      );
      if (meta && meta.orgId && meta.region) {
        this.#organizationId = meta.orgId;
        this.#region = meta.region;
        // Update logger context
        this.#logger = this.#logger.withContext({
          orgId: this.#organizationId,
          region: this.#region,
        });
        this.#logger.debug('Loaded router metadata from storage.');
      } else {
        this.#logger.debug('Router metadata not found in storage, awaiting initialization.');
      }
    } catch (err) {
      this.#logger.error('Failed to load router metadata from storage', err);
      // Cannot track reliably here as orgId/region loading failed.
    }
  }

  /**
   * Loads cached active regions from storage
   */
  async #loadRegionCache(): Promise<void> {
    try {
      const cachedData = await this.state.storage.get<{ regions: string[]; timestamp: number }>(
        ACTIVE_REGIONS_CACHE_KEY,
      );
      if (cachedData) {
        this.#activeRegionsCache = new Set(cachedData.regions);
        this.#lastRegionCacheUpdate = cachedData.timestamp;
        this.#logger.debug('Loaded active regions from storage cache.', {
          count: this.#activeRegionsCache.size,
          timestamp: new Date(this.#lastRegionCacheUpdate).toISOString(),
        });
      }
    } catch (err) {
      this.#logger.error('Failed to load active regions cache from storage', err);
    }
  }

  /**
   * Persists the current state to durable storage
   */
  async #persistState(): Promise<void> {
    // Store channel to shard mappings
    const channelMappings: [string, string[]][] = [];
    for (const [channel, shards] of this.#channelToShards) {
      channelMappings.push([channel, [...shards]]);
    }

    // Store consistent hash rings
    const hashRingsData: [string, string[]][] = [];
    for (const [channel, hashRing] of this.#hashRings) {
      hashRingsData.push([channel, hashRing.getNodes()]);
    }

    // Store shard connection counts
    const connectionCounts: [string, number][] = [];
    for (const [shardId, count] of this.#shardConnectionCounts) {
      connectionCounts.push([shardId, count]);
    }

    // Use Promise.allSettled for robustness
    const results = await Promise.allSettled([
      this.state.storage.put('channelToShards', channelMappings),
      this.state.storage.put('hashRings', hashRingsData),
      this.state.storage.put('shardConnectionCounts', connectionCounts),
    ]);

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const key = ['channelToShards', 'hashRings', 'shardConnectionCounts'][index];
        this.#logger.error(`Failed to persist state key '${key}'`, result.reason);
        // Track error here, as metadata should be available if persistState is called
        this.#trackError('persist_state_failed', result.reason, { stateKey: key });
      }
    });
  }

  /**
   * Registers a channel with a shard
   *
   * @param channel - Channel name to register
   * @param shardId - Shard identifier to associate with the channel
   */
  async register({ channel, shardId }: ChannelRegistration): Promise<void> {
    // Ensure metadata is loaded before tracking
    await this.#loadMetadata();

    // Check if metadata is available for analytics
    const canTrack = !!(this.#organizationId && this.#routerId);

    let shards = this.#channelToShards.get(channel);
    if (!shards) {
      shards = new Set<string>();
      this.#channelToShards.set(channel, shards);
    }
    shards.add(shardId);

    // Update consistent hash ring
    let hashRing = this.#hashRings.get(channel);
    if (!hashRing) {
      hashRing = new ConsistentHash();
      this.#hashRings.set(channel, hashRing);
    }
    hashRing.addNode(shardId);

    try {
      // Revert to persisting the whole state map
      await this.#persistState();
      this.#logger.debug('Persisted full state after channel registration', { channel, shardId });
    } catch (persistErr) {
      this.#logger.error('Failed to persist state after channel registration', {
        channel,
        shardId,
        persistErr,
      });
      this.#trackError('register_persist_failed', persistErr, { channel, shardId });
    }

    // Track Event
    if (canTrack) {
      try {
        const event = trackChannelRegistered({
          organizationId: this.#organizationId!,
          channel: channel,
          routerId: this.#routerId,
        });
        sendEvent(this.state, this.env, this.#logger, event);
      } catch (trackErr) {
        this.#logger.error('Failed to track channel_registered event', trackErr);
      }
    } else {
      this.#logger.warn('Skipping channel_registered tracking due to missing metadata.');
    }
  }

  /**
   * Unregisters a channel from a shard
   *
   * @param channel - Channel name to unregister
   * @param shardId - Shard identifier to remove from the channel
   */
  async unregister({ channel, shardId }: ChannelRegistration): Promise<void> {
    // Ensure metadata is loaded before tracking
    await this.#loadMetadata();

    // Check if metadata is available for analytics
    const canTrack = !!(this.#organizationId && this.#routerId);

    const shards = this.#channelToShards.get(channel);
    if (!shards) return;

    shards.delete(shardId);
    if (shards.size === 0) {
      this.#channelToShards.delete(channel);
    }

    // Update consistent hash ring
    const hashRing = this.#hashRings.get(channel);
    if (hashRing) {
      hashRing.removeNode(shardId);
      if (hashRing.getNodes().length === 0) {
        this.#hashRings.delete(channel);
      }
    }

    try {
      // Revert to persisting the whole state map
      await this.#persistState();
      this.#logger.debug('Persisted full state after channel unregistration', { channel, shardId });
    } catch (persistErr) {
      this.#logger.error('Failed to persist state after channel unregistration', {
        channel,
        shardId,
        persistErr,
      });
      this.#trackError('unregister_persist_failed', persistErr, { channel, shardId });
    }

    // Track Event
    if (canTrack) {
      try {
        const event = trackChannelUnregistered({
          organizationId: this.#organizationId!,
          channel: channel,
          routerId: this.#routerId,
        });
        sendEvent(this.state, this.env, this.#logger, event);
      } catch (trackErr) {
        this.#logger.error('Failed to track channel_unregistered event', trackErr);
      }
    } else {
      this.#logger.warn('Skipping channel_unregistered tracking due to missing metadata.');
    }
  }

  /**
   * Looks up all shards for a channel
   *
   * @param channel - Channel name to look up
   * @returns Array of shard identifiers responsible for the channel
   */
  async lookup({ channel }: ChannelLookup): Promise<string[]> {
    return [...(this.#channelToShards.get(channel) ?? [])];
  }

  /**
   * Assigns a shard for a new connection using consistent hashing
   *
   * @param channel - Channel name to find a shard for
   * @param connectionId - Connection identifier for consistent hashing
   * @returns Shard identifier or null if no shards available
   */
  async assignShard({ channel, connectionId }: ShardAssignment): Promise<string | null> {
    const shards = this.#channelToShards.get(channel);
    if (!shards || shards.size === 0) {
      return null;
    }

    const hashRing = this.#hashRings.get(channel);
    if (hashRing) {
      return hashRing.getNode(connectionId);
    }

    // Fallback to random assignment if no hash ring exists
    const shardArray = [...shards];
    return shardArray[Math.floor(Math.random() * shardArray.length)];
  }

  /**
   * Increments connection count for a shard
   *
   * @param shardId - Shard identifier to increment count for
   */
  async incrementShardConnections({ shardId }: ShardConnections): Promise<void> {
    const newCount = (this.#shardConnectionCounts.get(shardId) ?? 0) + 1;
    this.#shardConnectionCounts.set(shardId, newCount);
    try {
      // Persist granular count
      await this.state.storage.put(`count:${shardId}`, newCount);
    } catch (persistErr) {
      this.#logger.error('Failed to persist granular count after incrementing connections', {
        shardId,
        persistErr,
      });
      this.#trackError('increment_persist_failed', persistErr, { shardId });
    }
  }

  /**
   * Decrements connection count for a shard
   *
   * @param shardId - Shard identifier to decrement count for
   */
  async decrementShardConnections({ shardId }: ShardConnections): Promise<void> {
    const currentCount = this.#shardConnectionCounts.get(shardId) ?? 0;
    let deleted = false;
    if (currentCount > 1) {
      const newCount = currentCount - 1;
      this.#shardConnectionCounts.set(shardId, newCount);
      try {
        // Persist granular count
        await this.state.storage.put(`count:${shardId}`, newCount);
      } catch (persistErr) {
        this.#logger.error('Failed to persist granular count after decrementing connections', {
          shardId,
          persistErr,
        });
        this.#trackError('decrement_persist_failed', persistErr, { shardId });
      }
    } else {
      this.#shardConnectionCounts.delete(shardId);
      deleted = true;
      try {
        // Delete count if zero
        await this.state.storage.delete(`count:${shardId}`);
      } catch (persistErr) {
        this.#logger.error('Failed to delete granular count after decrementing connections', {
          shardId,
          persistErr,
        });
        this.#trackError('decrement_persist_failed', persistErr, { shardId, deleted });
      }
    }
  }

  /**
   * Gets current connection count for a shard
   *
   * @param shardId - Shard identifier to get count for
   * @returns Number of active connections on the shard
   */
  async getShardConnections({ shardId }: ShardConnections): Promise<number> {
    return this.#shardConnectionCounts.get(shardId) ?? 0;
  }

  /**
   * Lists all shards across all channels
   *
   * @returns Array of unique shard identifiers across all channels
   */
  async listShards(): Promise<string[]> {
    // Collect all unique shards from all channels
    const allShards = new Set<string>();
    for (const shards of this.#channelToShards.values()) {
      for (const shard of shards) {
        allShards.add(shard);
      }
    }
    return [...allShards];
  }

  /**
   * Unregisters a shard from all channels
   *
   * @param shardId - Shard identifier to unregister from all channels
   */
  async unregisterAll({ shardId }: ShardConnections): Promise<void> {
    const channelsToRemoveFrom: string[] = [];
    for (const [channel, shards] of this.#channelToShards) {
      if (shards.has(shardId)) {
        channelsToRemoveFrom.push(channel);
        shards.delete(shardId);
        if (shards.size === 0) {
          this.#channelToShards.delete(channel);
        }

        // Update consistent hash ring
        const hashRing = this.#hashRings.get(channel);
        if (hashRing) {
          hashRing.removeNode(shardId);
          if (hashRing.getNodes().length === 0) {
            this.#hashRings.delete(channel);
          }
        }
      }
    }

    // Remove shard connection count
    const countDeleted = this.#shardConnectionCounts.delete(shardId);

    // Persist granular changes
    const persistPromises: Promise<any>[] = [];

    for (const channel of channelsToRemoveFrom) {
      const shards = this.#channelToShards.get(channel); // Get updated set
      const hashRing = this.#hashRings.get(channel); // Get updated ring

      if (shards && shards.size > 0) {
        persistPromises.push(this.state.storage.put({ [channel]: [...shards] }));
      } else {
        persistPromises.push(this.state.storage.delete(channel));
      }

      if (hashRing && hashRing.getNodes().length > 0) {
        persistPromises.push(this.state.storage.put(`ring:${channel}`, hashRing.getNodes()));
      } else {
        persistPromises.push(this.state.storage.delete(`ring:${channel}`));
      }
    }

    // Delete the count if it existed
    if (countDeleted) {
      persistPromises.push(this.state.storage.delete(`count:${shardId}`));
    }

    try {
      // Wait for all granular updates/deletions
      const results = await Promise.allSettled(persistPromises);
      results.forEach((result) => {
        if (result.status === 'rejected') {
          this.#logger.error('Failed granular persist during unregisterAll', result.reason);
          this.#trackError('unregister_all_persist_failed', result.reason, { shardId });
        }
      });
      this.#logger.debug('Completed granular persistence for unregisterAll', { shardId });
    } catch (persistErr) {
      // This catch block might be redundant now with allSettled, but keep for safety
      this.#logger.error('Error during Promise.allSettled in unregisterAll', persistErr, {
        shardId,
      });
      this.#trackError('unregister_all_settled_error', persistErr, { shardId });
    }
  }

  /**
   * Lists all channels
   *
   * @returns Array of all channel names
   */
  async listChannels(): Promise<string[]> {
    return [...this.#channelToShards.keys()];
  }

  // --- Presence Fan-out --- //

  /**
   * Receives a presence update from a remote region's router and triggers local fan-out.
   */
  async receiveCrossRegionUpdate(payload: {
    channel: string;
    socketId: string;
    presenceEntry: PresenceEntry;
    originatingShardId: string; // Note: This ID is from the original shard, not the calling router
  }): Promise<void> {
    await this.#loadMetadata(); // Ensure metadata/logger is ready
    this.#logger.debug('Received cross-region presence update', {
      channel: payload.channel,
      identity: payload.presenceEntry.identity,
      fromShard: payload.originatingShardId, // Might be useful for tracing
    });

    // Trigger local fan-out by calling publishPresenceUpdate, marking it as remote
    // Pass true as the second argument to prevent an infinite loop
    await this.publishPresenceUpdate(payload, true);
  }

  /**
   * Receives a presence update from one shard and forwards it to all other
   * relevant shards within this router's region.
   * If the update originated locally (isRemote=false), it also triggers fan-out
   * to peer regions.
   */
  async publishPresenceUpdate(
    payload: {
      channel: string;
      socketId: string;
      presenceEntry: PresenceEntry;
      originatingShardId: string;
    },
    isRemote: boolean = false, // Flag to prevent cross-region loops
  ): Promise<void> {
    const { channel, socketId, presenceEntry, originatingShardId } = payload;
    const routerLogPrefix = `[${DO_PREFIX.CHANNEL_ROUTER}:${this.#routerId}]`; // Use member var

    // Ensure state is loaded (might be redundant if constructor blocks, but safe)
    await this.#loadState(); // Load state first
    await this.#loadMetadata(); // Then metadata (which updates logger)

    // Basic check if metadata loaded for logging/tracking
    if (!this.#organizationId || !this.#region) {
      this.#logger.error('Cannot publish presence update: Router metadata not initialized.');
      // Don't track here as we lack org/region context
      return;
    }

    // --- LOCAL FAN-OUT --- //
    this.#logger.debug('Starting local fan-out for presence update', { channel });
    // Find all shards registered for this channel in this region
    const targetShards = this.#channelToShards.get(channel);

    if (!targetShards || targetShards.size === 0) {
      this.#logger.warn(`No shards registered for channel ${channel}, presence update dropped.`, {
        channel,
      });
      return;
    }

    const updatePromises: Promise<void>[] = [];

    for (const shardId of targetShards) {
      // Optionally skip sending back to the originating shard
      // if (shardId === originatingShardId) continue;

      try {
        const shardStub = this.env.SOCKET_SHARD.get(this.env.SOCKET_SHARD.idFromName(shardId));
        // Call receivePresenceUpdate on the shard (fire-and-forget pattern)
        // Wrap individual calls to catch errors per shard
        updatePromises.push(
          shardStub.receivePresenceUpdate(payload).catch((shardErr: any) => {
            this.#logger.error(
              `Failed to call receivePresenceUpdate on shard ${shardId}`,
              shardErr,
            );
            this.#trackError('publish_presence_shard_call_failed', shardErr, {
              targetShardId: shardId,
              channel: channel,
            });
          }),
        );
      } catch (err) {
        this.#logger.error(`${routerLogPrefix} Failed to get shard stub ${shardId}`, err);
        // Track error for getting the stub
        this.#trackError('publish_presence_get_stub_failed', err, {
          targetShardId: shardId,
          channel: channel,
        });
      }
    }

    if (updatePromises.length > 0) {
      // Use waitUntil to ensure the calls are made, even if the router execution finishes
      this.ctx.waitUntil(Promise.allSettled(updatePromises)); // Already logging failures inside catch
    }
    this.#logger.debug('Finished local fan-out for presence update', { channel });
    // --- END LOCAL FAN-OUT ---

    // --- CROSS-REGION FAN-OUT (Only if update originated locally) --- //
    if (!isRemote) {
      this.#logger.debug(
        'Originating presence update locally, initiating cross-region fan-out...',
        {
          channel,
        },
      );
      try {
        const peerRegions = await this.#getPeerRegions();
        if (peerRegions.length > 0) {
          this.#logger.info(`Fanning out presence update to ${peerRegions.length} peer regions.`, {
            peerRegions,
            channel,
          });
          const crossRegionPromises: Promise<void>[] = [];

          for (const peerRegion of peerRegions) {
            try {
              const remoteRouterId = this.env.CHANNEL_ROUTER.idFromName(
                `router:${this.#organizationId}:${peerRegion}`,
              );
              const remoteRouterStub = this.env.CHANNEL_ROUTER.get(remoteRouterId);

              // Call receiveCrossRegionUpdate on the remote router stub
              crossRegionPromises.push(
                (remoteRouterStub as any)
                  .receiveCrossRegionUpdate(payload)
                  .catch((remoteErr: any) => {
                    this.#logger.error(
                      `Failed cross-region presence call to region ${peerRegion}`,
                      remoteErr,
                    );
                    this.#trackError('cross_region_call_failed', remoteErr, {
                      targetRegion: peerRegion,
                      channel: channel,
                    });
                  }),
              );
            } catch (stubErr) {
              this.#logger.error(
                `Failed to get remote router stub for region ${peerRegion}`,
                stubErr,
              );
              this.#trackError('cross_region_get_stub_failed', stubErr, {
                targetRegion: peerRegion,
                channel: channel,
              });
            }
          }
          // Fire-and-forget the cross-region calls
          if (crossRegionPromises.length > 0) {
            this.ctx.waitUntil(Promise.allSettled(crossRegionPromises));
          }
        } else {
          this.#logger.debug(
            'No peer regions found or cache empty, skipping cross-region fan-out.',
            {
              channel,
            },
          );
        }
      } catch (err) {
        this.#logger.error('Error during cross-region fan-out initiation', err);
        this.#trackError('cross_region_initiation_failed', err, { channel });
      }
    }
    // --- END CROSS-REGION FAN-OUT ---
  }

  /**
   * Initializes the router with necessary metadata. Should be called by the service
   * that first obtains the stub for this router instance.
   * Idempotent: Stores metadata only if not already present.
   */
  async initialize(metadata: { organizationId: string; region: string }): Promise<void> {
    // Ensure state is loaded before potentially writing
    await this.#loadState();
    await this.#loadMetadata(); // Attempt load first

    if (this.#organizationId && this.#region) {
      this.#logger.debug('Router metadata already initialized, skipping write.');
      return; // Already initialized
    }

    const { organizationId, region } = metadata;
    if (!organizationId || !region) {
      this.#logger.error('Initialize called with invalid metadata', { organizationId, region });
      return;
    }

    this.#organizationId = organizationId;
    this.#region = region;
    this.#logger = this.#logger.withContext({ orgId: this.#organizationId, region: this.#region });

    try {
      await this.state.storage.put(ROUTER_METADATA_KEY, { orgId: organizationId, region: region });
      this.#logger.info('Router metadata initialized and persisted.');
    } catch (err) {
      this.#logger.error('Failed to persist router metadata during initialization', err);
      // Track error here
      this.#trackError('initialize_persist_failed', err, {
        initOrgId: organizationId,
        initRegion: region,
      });
    }
  }

  /** Helper to track errors consistently within ChannelRouter */
  #trackError(contextSuffix: string, error: Error | unknown, details?: Record<string, any>): void {
    if (!this.#logger) {
      // Should not happen if metadata loaded, but check anyway
      console.error('ChannelRouter: Logger not initialized, cannot track error', error);
      return;
    }
    if (!this.#organizationId || !this.#region) {
      // Log if metadata is missing when trying to track
      this.#logger.warn('Cannot track error event: Metadata (orgId/region) not available.', {
        contextSuffix,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const event = trackErrorOccurred({
      context: `channel_router_${contextSuffix}`,
      error: error instanceof Error ? error.message : String(error),
      organizationId: this.#organizationId, // Use loaded orgId
      region: this.#region, // <-- Pass region here
      details: {
        routerIdShort: this.#routerId.slice(0, 8),
        ...(details ?? {}),
      },
    });
    sendEvent(this.state, this.env, this.#logger, event);
  }

  /**
   * Gets peer regions (active regions excluding self) using caching.
   * Ensures metadata (orgId, region) is loaded before fetching.
   */
  async #getPeerRegions(): Promise<string[]> {
    // Ensure metadata is available
    await this.#loadMetadata();
    if (!this.#organizationId || !this.#region) {
      this.#logger.error('Cannot get peer regions: Router metadata not initialized.');
      return [];
    }

    const now = Date.now();
    // Check if cache is stale
    if (now - this.#lastRegionCacheUpdate > REGION_CACHE_TTL_MS) {
      this.#logger.debug('Active regions cache stale, refreshing...', {
        lastUpdate: new Date(this.#lastRegionCacheUpdate).toISOString(),
      });
      try {
        const activeRegions = await getActiveRegions(this.env, this.#organizationId);
        this.#activeRegionsCache = new Set(activeRegions);
        this.#lastRegionCacheUpdate = now;
        // Persist the updated cache to storage (fire-and-forget)
        this.ctx.waitUntil(
          this.state.storage.put(ACTIVE_REGIONS_CACHE_KEY, {
            regions: activeRegions,
            timestamp: now,
          }),
        );
        this.#logger.info('Refreshed active regions cache from KV.', {
          count: this.#activeRegionsCache.size,
        });
      } catch (err) {
        this.#logger.error('Failed to refresh active regions cache from KV', err);
        // Return potentially stale cache data or empty array on error
        this.#trackError('get_active_regions_failed', err);
        // Fall through to return existing cache content
      }
    } else {
      this.#logger.debug('Using cached active regions.');
    }

    // Return regions excluding self
    return [...this.#activeRegionsCache].filter((r) => r !== this.#region);
  }
}
