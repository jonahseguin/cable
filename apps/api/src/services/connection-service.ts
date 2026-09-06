/**
 * Connection Service
 *
 * Handles WebSocket connection management, including:
 * - Connection validation and token verification
 * - Shard assignment with load balancing
 * - Connection preparation and routing
 */
import { markRegionActive } from '../utils/region';
import {
  HIGH_LOAD_THRESHOLD,
  MAX_CONNECTIONS_PER_SHARD,
  MEDIUM_LOAD_THRESHOLD,
} from '../constants';
import { verifySocketToken, SocketTokenPayload } from '@[removed]/auth';
import { ConsistentHash } from '../utils/consistent-hash';
import type {
  ChannelRouterMethods,
  ErrorResponse,
  PublishResponse,
  PublishPayload,
  PersistenceQueueMessage,
  ChannelMessage,
  ShardAssignment,
  ShardConnections,
  R2MessageObject,
  HistoryResponseMessage,
  HistoryResponse,
  SocketConnection,
} from '../types';
import { nanoid } from 'nanoid';

/**
 * Result of connection validation
 */
type ValidationResult =
  | { success: true; connection: SocketTokenPayload }
  | { success: false; status: number; error: string };

/**
 * Shard assignment result
 */
interface ShardAssignmentResult {
  shardName: string;
  assignedShards: Map<string, string>;
}

/**
 * Validates a WebSocket connection request
 *
 * Verifies the connection is a valid WebSocket upgrade request
 * and that the provided token is valid.
 *
 * @param upgradeHeader The Upgrade header from the request
 * @param token The connection token to validate
 * @returns Success with connection details or failure with error information
 */
export async function validateConnection(
  upgradeHeader: string | undefined,
  token: string,
): Promise<ValidationResult> {
  // Verify this is a WebSocket upgrade request
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return {
      success: false,
      status: 426,
      error: 'Connection must use WebSocket upgrade',
    };
  }

  // Validate token and retrieve connection details
  const connection = await verifySocketToken(token);
  if (!connection || !connection.valid || !connection.payload) {
    return {
      success: false,
      status: 403,
      error: connection.error ?? 'Invalid or expired connection token',
    };
  }

  // // Mark token as connected to prevent reuse
  // await markTokenConnected(token);
  // TODO

  return { success: true, connection: connection.payload };
}

/**
 * Determines the optimal shard to route a connection to
 *
 * Uses consistent hashing for channel locality combined with
 * load balancing to distribute connections evenly.
 *
 * @param env Cloudflare environment bindings
 * @param connection The validated connection details
 * @param region The geographic region for the connection
 * @param ctx Execution context
 * @returns The selected shard name and channel-to-shard assignments
 */
export async function determineTargetShard(
  env: Env,
  connection: SocketConnection,
  region: string,
  ctx: ExecutionContext,
): Promise<ShardAssignmentResult> {
  // Get router for this account/region
  const routerName = `router:${connection.organizationId}:${region}`;
  const routerId = env.CHANNEL_ROUTER.idFromName(routerName);

  // Get router stub and immediately initialize it
  const routerStub = env.CHANNEL_ROUTER.get(routerId);
  ctx.waitUntil(
    (routerStub as any).initialize({ organizationId: connection.organizationId, region }),
  );

  // Track assigned shards for each channel
  const assignedShards = new Map<string, string>();

  // Use consistent hashing to find the best shard for each channel
  for (const channel of connection.channels) {
    const assignedShard = await (routerStub as any).assignShard({
      channel,
      connectionId: connection.identity,
    });

    if (assignedShard) {
      assignedShards.set(channel, assignedShard);
    }
  }

  // Count channel-to-shard assignments to identify best candidate
  const shardCounts = new Map<string, number>();
  for (const shardName of assignedShards.values()) {
    shardCounts.set(shardName, (shardCounts.get(shardName) ?? 0) + 1);
  }

  let targetShard: string;

  if (shardCounts.size === 0) {
    // No existing shards - create first shard for this account/region
    targetShard = `shard:${connection.organizationId}:${region}:0`;
  } else {
    // Get current connection counts for candidate shards
    const connectionCounts = new Map<string, number>();
    for (const shardName of shardCounts.keys()) {
      const connections = await (routerStub as any).getShardConnections({ shardId: shardName });
      connectionCounts.set(shardName, connections);
    }

    // Group shards by channel match count to maximize locality
    const shardsByMatchCount = new Map<number, string[]>();
    for (const [shardName, matchCount] of shardCounts.entries()) {
      const shards = shardsByMatchCount.get(matchCount) ?? [];
      shards.push(shardName);
      shardsByMatchCount.set(matchCount, shards);
    }

    // Sort match counts in descending order (prefer higher matches)
    const sortedMatchCounts = [...shardsByMatchCount.keys()].sort((a, b) => b - a);

    // Find shards with acceptable load levels
    let candidateShards: string[] = [];

    // Try to find shards with highest match count and acceptable load
    for (const matchCount of sortedMatchCounts) {
      const shardsInTier = shardsByMatchCount.get(matchCount) ?? [];

      // First try shards with low to medium load
      const lowLoadShards = shardsInTier.filter(
        (shard) =>
          (connectionCounts.get(shard) ?? 0) / MAX_CONNECTIONS_PER_SHARD < MEDIUM_LOAD_THRESHOLD,
      );

      if (lowLoadShards.length > 0) {
        candidateShards = lowLoadShards;
        break;
      }

      // Then try shards with medium to high load
      const mediumLoadShards = shardsInTier.filter(
        (shard) =>
          (connectionCounts.get(shard) ?? 0) / MAX_CONNECTIONS_PER_SHARD < HIGH_LOAD_THRESHOLD,
      );

      if (mediumLoadShards.length > 0) {
        candidateShards = mediumLoadShards;
        break;
      }

      // If highest match count, use all shards from this tier
      if (matchCount === sortedMatchCounts[0]) {
        candidateShards = shardsInTier;
      }
    }

    // If we still don't have candidates, use all available shards
    if (candidateShards.length === 0) {
      candidateShards = [...shardCounts.keys()];
    }

    // From our final candidates, select the least loaded one
    candidateShards.sort((a, b) => (connectionCounts.get(a) ?? 0) - (connectionCounts.get(b) ?? 0));
    targetShard = candidateShards[0];
  }

  // Check if the chosen shard is at capacity
  const shardConnectionCount = await (routerStub as any).getShardConnections({
    shardId: targetShard,
  });

  if (shardConnectionCount >= MAX_CONNECTIONS_PER_SHARD) {
    // Create a new shard if at capacity
    const existingShards = await (routerStub as any).listShards();
    const regionShardPrefix = `shard:${connection.organizationId}:${region}:`;

    const highestIndex = Math.max(
      ...existingShards
        .filter((s: string) => s.startsWith(regionShardPrefix))
        .map((s: string) => parseInt(s.split(':').pop() ?? '0', 10)),
      -1,
    );

    targetShard = `${regionShardPrefix}${highestIndex + 1}`;
  }

  return { shardName: targetShard, assignedShards };
}

/**
 * Prepares a connection for a specific shard
 *
 * Registers channels with the shard, increments connection counts,
 * and marks the region as active.
 *
 * @param env Cloudflare environment bindings
 * @param connection The validated connection details
 * @param region The geographic region for the connection
 * @param shardName The selected shard name
 * @param ctx Execution context
 * @returns Objects needed to complete the connection
 */
export async function prepareShardConnection(
  env: Env,
  connection: SocketConnection,
  region: string,
  shardName: string,
  ctx: ExecutionContext,
): Promise<{ routerId: string; shardId: string; shard: DurableObjectStub }> {
  // Get router and shard objects
  const routerName = `router:${connection.organizationId}:${region}`;
  const routerId = env.CHANNEL_ROUTER.idFromName(routerName);

  // Get router stub and immediately initialize it
  const routerStub = env.CHANNEL_ROUTER.get(routerId);
  ctx.waitUntil(
    (routerStub as any).initialize({ organizationId: connection.organizationId, region }),
  );

  const shardId = env.SOCKET_SHARD.idFromName(shardName);
  const shard = env.SOCKET_SHARD.get(shardId);

  // Register all channels with the shard
  const registrationPromises = connection.channels.map((channel) =>
    (routerStub as any).register({
      channel,
      shardId: shardName,
    }),
  );
  await Promise.all(registrationPromises);

  // Increment connection count on the *router* for the chosen shard
  ctx.waitUntil((routerStub as any).incrementShardConnections({ shardId: shardName }));

  // Mark region as active for this account
  await markRegionActive(env, connection.organizationId, region);

  // Return the necessary stubs/IDs (adjust based on actual needs)
  return { routerId: routerId.toString(), shardId: shardId.toString(), shard };
}

// Helper function to create shard ID
function createShardName(orgId: string, region: string, shardNum: number | string): string {
  return `shard:${orgId}:${region}:${shardNum}`;
}
