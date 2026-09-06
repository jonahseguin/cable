/**
 * Publish Service
 *
 * Manages the publication of messages to WebSocket clients across regions and shards.
 * Includes caching and rate limiting to optimize performance and stability.
 */
import { getActiveRegions } from '../utils/region';
import { CACHE_TTL } from '../constants';
import type {
  ChannelMessage,
  ChannelRouterMethods,
  ErrorResponse,
  PublishResponse,
  ShardAssignment,
} from '../types';

// Analytics Imports
import { trackErrorOccurred } from '../services/analytics-service';
import { Logger } from '../utils/logger';
import { ChannelRouter } from '../durable-objects/channel-router';

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  data: T;
  expires: number;
}

/**
 * Publish result interface
 */
interface PublishResult {
  success: boolean;
  shardMap?: Record<string, string[]>;
  error?: string;
  status?: number;
}

// In-memory cache for active regions to reduce KV reads
const regionCache = new Map<string, CacheEntry<string[]>>();

// In-memory cache for channel mappings to reduce Durable Object reads
const channelCache = new Map<string, CacheEntry<Record<string, string[]>>>();

/**
 * Gets active regions for an account with memory caching
 *
 * @param env Cloudflare environment bindings
 * @param organizationId Organization identifier
 * @returns List of active regions for the account
 */
export async function getRegionsWithCache(env: Env, organizationId: string): Promise<string[]> {
  const now = Date.now();
  const cacheKey = `regions:${organizationId}`;
  const cachedEntry = regionCache.get(cacheKey);

  // Return from cache if valid
  if (cachedEntry && cachedEntry.expires > now) {
    return cachedEntry.data;
  }

  // Fetch from KV if not in cache or expired
  const regions = await getActiveRegions(env, organizationId);

  // Cache the result
  regionCache.set(cacheKey, {
    data: regions,
    expires: now + CACHE_TTL.REGION,
  });

  return regions;
}

/**
 * Gets all shards responsible for a channel with memory caching
 *
 * @param env Cloudflare environment bindings
 * @param organizationId Organization identifier
 * @param channel Channel name
 * @param regions List of active regions to check
 * @returns Map of regions to shard IDs responsible for the channel
 */
export async function getShardMapWithCache(
  env: Env,
  organizationId: string,
  channel: string,
  regions: string[],
): Promise<Record<string, string[]>> {
  const now = Date.now();
  const cacheKey = `${organizationId}:${channel}`;
  const cachedEntry = channelCache.get(cacheKey);

  // Return from cache if valid
  if (cachedEntry && cachedEntry.expires > now) {
    return cachedEntry.data;
  }

  // Build shard map for each active region
  const shardMap: Record<string, string[]> = {};

  // Query each region's router in parallel
  const regionQueries = regions.map(async (region) => {
    const routerId = env.CHANNEL_ROUTER.idFromName(`router:${organizationId}:${region}`);
    const router = env.CHANNEL_ROUTER.get(routerId);
    const shardIds = await router.lookup({ channel });

    if (shardIds.length > 0) {
      shardMap[region] = shardIds;
    }
  });

  await Promise.all(regionQueries);

  // Cache results
  channelCache.set(cacheKey, {
    data: shardMap,
    expires: now + CACHE_TTL.CHANNEL,
  });

  return shardMap;
}

// Define fanout limit locally if not in constants
const MAX_SHARD_FANOUT = 100;

/**
 * Gets the ChannelRouter stubs for all active regions for an organization.
 * Also initializes the routers.
 */
async function getRoutersForPublish(
  env: Env,
  organizationId: string,
  ctx: ExecutionContext,
  logger: Logger,
): Promise<{ region: string; stub: DurableObjectStub<ChannelRouter> }[]> {
  let targetRegions: string[] = [];
  // Always publish to all active regions for now.
  targetRegions = await getActiveRegions(env, organizationId);
  if (targetRegions.length === 0) {
    logger.info('No active regions found for account, publish will be dropped');
    return []; // No active regions, nowhere to publish
  }

  logger.debug('Targeting active regions for publish', { regions: targetRegions });

  const routers: { region: string; stub: DurableObjectStub<ChannelRouter> }[] = [];
  for (const region of targetRegions) {
    const routerName = `router:${organizationId}:${region}`;
    const routerId = env.CHANNEL_ROUTER.idFromName(routerName);

    // Get stub and initialize it (using fire-and-forget via waitUntil)
    const routerStub = env.CHANNEL_ROUTER.get(routerId) as DurableObjectStub<ChannelRouter>;
    ctx.waitUntil((routerStub as any).initialize({ organizationId, region }));

    routers.push({ region, stub: routerStub });
  }

  return routers;
}

/**
 * Publishes a message to a channel across all regions and shards
 *
 * Handles:
 * - Finding all shards across regions responsible for a channel
 * - Rate limiting excessive fan-out
 * - Distributing the message to all relevant shards
 *
 * @param env Cloudflare environment bindings
 * @param organizationId Organization identifier
 * @param channel Channel name
 * @param payload Message payload to deliver
 * @returns Result with success status and distribution information
 */
export async function publishToChannel(
  env: Env,
  organizationId: string,
  channel: string,
  payload: string,
  ctx: ExecutionContext,
): Promise<PublishResult> {
  const logger = new Logger({ context: { service: 'publish-service' } });
  logger.debug('publishToChannel invoked', { organizationId, channel });

  const routers = await getRoutersForPublish(env, organizationId, ctx, logger);
  logger.debug('Routers obtained for publish', {
    routerCount: routers.length,
    regions: routers.map((r) => r.region),
  });

  if (routers.length === 0) {
    logger.warn('No routers found for publish target', { organizationId });
    return {
      success: false,
      error: 'No routers found for publish target',
      status: 500,
    };
  }

  const shardMap: Record<string, string[]> = {};

  for (const router of routers) {
    try {
      // --- Logging: Before router lookup ---
      logger.debug('Looking up shards for channel in router', { region: router.region, channel });
      const shards = await router.stub.lookup({ channel });
      // --- Logging: After router lookup ---
      logger.debug('Router lookup result', { region: router.region, channel, foundShards: shards });

      if (shards && shards.length > 0) {
        shardMap[router.region] = shards;
      }
    } catch (err) {
      const errorEvent = trackErrorOccurred({
        context: 'publish_service_router_lookup',
        error: err instanceof Error ? err.message : String(err),
        organizationId: organizationId,
        details: { region: router.region, channel },
      });

      logger.error(`Error communicating with router in region ${router.region}`, err, {
        organizationId,
        channel,
      });
    }
  }

  // --- Logging: Final shard map ---
  logger.debug('Final shard map constructed', { shardMap });

  if (Object.keys(shardMap).length === 0) {
    logger.info('No shards found for publish target', { organizationId, channel });
    return {
      success: true,
      shardMap: {},
    };
  }

  const shardIds = Object.values(shardMap).flat();
  // --- Logging: Flat list of shard IDs ---
  logger.debug('Final list of target shard IDs', { shardIds });

  if (shardIds.length > MAX_SHARD_FANOUT) {
    console.warn('[PublishService] Fan-out threshold exceeded', {
      organizationId,
      channel,
      shards: shardIds.length,
      threshold: MAX_SHARD_FANOUT,
    });

    return {
      success: false,
      error: 'Too many destination shards - message would exceed fan-out limit',
      status: 429,
    };
  }

  await Promise.all(
    shardIds.map(async (shardId) => {
      try {
        // --- Logging: Before getting shard stub ---
        logger.debug('Getting shard stub', { shardId, channel });
        const shardStub = env.SOCKET_SHARD.get(env.SOCKET_SHARD.idFromName(shardId));
        // --- Logging: Before calling publishToChannel on shard stub ---
        logger.debug('Calling publishToChannel on shard stub', { shardId, channel });
        // Wrap the call in try/catch for specific logging
        try {
          await shardStub.publishToChannel({ channel, payload });
          logger.debug('Successfully called publishToChannel on shard stub', { shardId, channel });
        } catch (publishErr) {
          logger.error(`Error calling publishToChannel on shard ${shardId}`, publishErr, {
            organizationId,
            channel,
            shardId,
          });
        }
      } catch (stubErr) {
        logger.error(`Error getting or calling shard stub ${shardId}`, stubErr, {
          organizationId,
          channel,
        });
      }
    }),
  );

  return { success: true, shardMap };
}
