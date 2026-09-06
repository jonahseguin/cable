/**
 * Presence Service
 *
 * Contains functions to handle presence logic, intended to be called
 * from the SocketShard Durable Object.
 */

import type {
  PresenceEntry,
  UpdatePresencePayload,
  PresenceStateMessage,
  PresenceUpdateMessage,
  PresenceValue,
  ChannelRouterMethods,
} from '../types';
import { DO_PREFIX } from '../constants';
import { Logger } from '../utils/logger';
import { trackErrorOccurred, sendEvent } from '../services/analytics-service';
import type { ChannelRouter } from '../durable-objects/channel-router'; // Assuming path is correct

// Define minimal context interface needed by service
interface DurableObjectCtx {
  waitUntil(promise: Promise<any>): void;
}

// --- Helper Types/Interfaces for Context ---

interface ShardContext {
  env: Env;
  ctx: DurableObjectCtx;
  organizationId: string;
  region: string;
  shardId: string;
}

interface SocketInfo {
  socketId: string;
  identity: string;
}

// Type for the local presence map within a shard
type LocalPresenceMap = Map<string, Map<string, PresenceEntry>>;

// --- Private Helper Functions (within this module) ---

function _getPresenceChannelStub(
  state: DurableObjectState,
  env: Env,
  organizationId: string,
  channel: string,
): DurableObjectStub | undefined {
  if (!env.PRESENCE_CHANNEL) {
    console.error('[PresenceService] PRESENCE_CHANNEL binding is missing!');
    return undefined;
  }
  const id = env.PRESENCE_CHANNEL.idFromName(
    `${DO_PREFIX.PRESENCE_CHANNEL}:${organizationId}:${channel}`,
  );
  const stub = env.PRESENCE_CHANNEL.get(id);

  // Initialize the presence channel DO (fire-and-forget)
  // Pass state which implements WaitUntilContext
  state.waitUntil((stub as any).initialize({ organizationId, channelName: channel }));

  return stub;
}

function getRouterStub(
  env: Env,
  organizationId: string,
  region: string,
  logger: Logger,
): DurableObjectStub | undefined {
  const routerName = `router:${organizationId}:${region}`;
  const id = env.CHANNEL_ROUTER.idFromName(routerName);
  const stub = env.CHANNEL_ROUTER.get(id);
  return stub;
}

/**
 * Sends an update to the central PresenceChannel DO.
 */
async function _updateGlobalPresence(
  ctx: DurableObjectCtx,
  presenceChannelStub: DurableObjectStub | undefined,
  socketId: string,
  identity: string,
  entryData: PresenceValue,
  organizationId: string,
  channelName: string,
): Promise<void> {
  if (!presenceChannelStub) {
    console.warn(
      '[PresenceService] Cannot update global presence: PRESENCE_CHANNEL stub unavailable.',
    );
    return;
  }

  const payload: UpdatePresencePayload = {
    socketId,
    identity,
    entry: entryData,
    organizationId,
    channelName,
  };
  // Fire-and-forget with logging
  ctx.waitUntil((presenceChannelStub as any).updatePresenceEntry(payload));
}

/**
 * Initiates regional fan-out via ChannelRouter.
 * DEPRECATED: Fan-out is now handled globally by PresenceChannel DO.
 */
/*
async function _fanOutPresenceUpdate(
  ctx: DurableObjectCtx,
  routerStub: DurableObjectStub | undefined,
  shardId: string,
  channel: string,
  socketId: string,
  presenceEntry: PresenceEntry,
): Promise<void> {
  if (!routerStub) {
    console.warn(
      `[PresenceService] Cannot fan out presence update for ${channel}: CHANNEL_ROUTER stub unavailable.`,
    );
    return;
  }
  // Fire-and-forget with logging
  const payload = {
    channel,
    socketId,
    presenceEntry,
    originatingShardId: shardId,
  };
  console.log(
    `[PresenceService] Fanning out presence update via router for ${socketId} in ${channel}`,
  ); // Example log
  ctx.waitUntil((routerStub as any).publishPresenceUpdate(payload));
}
*/

// --- Public Service Functions ---

/**
 * Updates the local presence cache within the SocketShard.
 */
export function updateLocalPresence(
  localPresence: LocalPresenceMap,
  channel: string,
  identity: string,
  presenceEntry: PresenceEntry,
): void {
  let channelMap = localPresence.get(channel);
  if (!channelMap) {
    channelMap = new Map<string, PresenceEntry>();
    localPresence.set(channel, channelMap);
  }
  channelMap.set(identity, presenceEntry);
}

/**
 * Handles presence updates when a socket connects.
 */
export async function handleConnectPresence(
  shardContext: ShardContext & { state: DurableObjectState },
  logger: Logger,
  socketInfo: SocketInfo,
  channels: string[],
  // Add originating shard's maps for local broadcast
  originatingSubscribers: Map<string, Set<WebSocket>>,
  originatingSocketIds: Map<WebSocket, string>,
): Promise<void> {
  const { env, ctx, organizationId, region, state, shardId } = shardContext;
  const { socketId, identity } = socketInfo;

  logger.info(
    `[PresenceService] Handling connect presence for ${socketId} (Identity: ${identity}) in shard ${shardId}`,
  );

  const routerStub = getRouterStub(env, organizationId, region, logger);
  if (!routerStub) {
    logger.error(`Cannot handle connect presence for ${socketId}: Local router stub unavailable.`);
    // Potentially track error here
    return; // Cannot proceed without router
  }
  // Initialize router (caller - SocketShard - passes state which has waitUntil)
  // Use ctx from ShardContext which should implement DurableObjectCtx
  // Use 'any' to bypass strict type checking for stub methods if ChannelRouter class import is complex
  ctx.waitUntil((routerStub as any).initialize({ organizationId, region }));

  const now = Date.now();

  for (const channel of channels) {
    logger.debug(`[PresenceService] Processing channel ${channel} for connect ${socketId}`);

    const initialPresenceValue: PresenceValue = {
      isConnected: true,
      data: {}, // Start with empty data; state will sync shortly after
      lastSeen: now,
    };
    const fullInitialEntry: PresenceEntry = {
      identity,
      ...initialPresenceValue,
    };

    const presenceChannelStub = _getPresenceChannelStub(state, env, organizationId, channel);

    // Use waitUntil for non-blocking updates to global state and fan-out
    _updateGlobalPresence(
      ctx,
      presenceChannelStub,
      socketId,
      identity,
      initialPresenceValue,
      organizationId,
      channel,
    );

    // Broadcast initial presence
    broadcastLocalPresenceUpdate(
      shardContext,
      originatingSubscribers, // <-- Use passed map
      originatingSocketIds, // <-- Use passed map
      channel,
      identity,
      fullInitialEntry,
    );

    // Fan out update via LOCAL router
    ctx.waitUntil(
      // Use 'any' to bypass strict type checking for stub methods
      (routerStub as any)
        .publishPresenceUpdate({
          channel,
          socketId,
          presenceEntry: fullInitialEntry,
          originatingShardId: shardId, // Pass shardId from context
        })
        .catch((err: unknown) => {
          // Use socketInfo from the outer scope
          logger.error('Failed to publish presence update via router on connect', {
            channel,
            socketId: socketInfo.socketId,
            identity: socketInfo.identity,
            error: err,
          });
          // Optionally track error
        }),
    );
  }
}

/**
 * Handles presence updates when a socket sets its presence data.
 */
export function handleSetPresence(
  shardContext: ShardContext & { state: DurableObjectState },
  logger: Logger,
  socketInfo: SocketInfo,
  channel: string,
  data: unknown, // Incoming partial update
  // State maps passed from SocketShard
  debounceTimers: Map<string, NodeJS.Timeout>,
  debouncedDataFrames: Map<string, unknown>,
  throttledKeys: Set<string>,
  pendingThrottledFrames: Map<string, unknown>,
  // Add maps back for local broadcast
  originatingSubscribers: Map<string, Set<WebSocket>>,
  originatingSocketIds: Map<WebSocket, string>,
  PRESENCE_DEBOUNCE_FRAME_MS: number, // Debounce interval first
  PRESENCE_THROTTLE_INTERVAL_MS: number, // Throttle interval second
): void {
  const { env, ctx, organizationId, region, state, shardId } = shardContext;
  const { socketId, identity } = socketInfo;
  const presenceKey = `${channel}:${identity}`;

  // --- Debounce & Merge Logic --- //

  // Get currently accumulating data frame for this key, or start empty
  const currentFrame = debouncedDataFrames.get(presenceKey) ?? {};
  const safeCurrentFrame =
    typeof currentFrame === 'object' && currentFrame !== null ? currentFrame : {};
  // Merge incoming partial data into the current frame
  const safeIncomingData = typeof data === 'object' && data !== null ? data : {};
  const mergedFrameData = { ...safeCurrentFrame, ...safeIncomingData };
  // Store the updated frame
  debouncedDataFrames.set(presenceKey, mergedFrameData);

  // Clear existing debounce timer if any
  const existingDebounceTimer = debounceTimers.get(presenceKey);
  if (existingDebounceTimer) {
    clearTimeout(existingDebounceTimer);
  }

  // Set a new debounce timer
  const newDebounceTimer = setTimeout(() => {
    // Debounce finished - frame is complete for now
    debounceTimers.delete(presenceKey); // Clean up timer map

    // Get the final merged frame accumulated during the debounce period
    const finalFrameData = debouncedDataFrames.get(presenceKey);
    debouncedDataFrames.delete(presenceKey); // Clean up frame map

    // If frame data is missing (shouldn't happen), log and exit
    if (finalFrameData === undefined) {
      logger.warn('Debounce timer fired but no frame data found.', { presenceKey });
      return;
    }

    // --- Trigger Throttling Logic --- //
    // Store this completed frame as the latest data pending throttling
    pendingThrottledFrames.set(presenceKey, finalFrameData);

    // If not currently throttled, schedule the throttled update
    if (!throttledKeys.has(presenceKey)) {
      throttledKeys.add(presenceKey);

      setTimeout(() => {
        // Throttle interval ended
        // Get the absolute latest *completed frame* stored
        const latestFrameToSend = pendingThrottledFrames.get(presenceKey);

        // Clean up throttle state *after* retrieving data
        pendingThrottledFrames.delete(presenceKey);
        throttledKeys.delete(presenceKey);

        if (latestFrameToSend === undefined) {
          logger.warn('Throttled presence update skipped: No pending frame found.', {
            presenceKey,
          });
          return;
        }

        // --- Perform Global Update (Partial Frame) & Regional Fan-Out (Merged Frame) --- //
        const updateTime = Date.now();

        // 1. Prepare data for Global Update (The completed frame)
        const presenceValueForGlobal: PresenceValue = {
          isConnected: true,
          data: latestFrameToSend, // Send the completed frame data
          lastSeen: updateTime,
        };

        // 2. Prepare data for Regional Fan-Out (Use final frame data)
        // Since local cache is removed, we send the debounced frame directly.
        // The global PresenceChannel handles authoritative merging.
        const safeLatestFrameToSend =
          typeof latestFrameToSend === 'object' && latestFrameToSend !== null
            ? latestFrameToSend
            : {};

        const fullEntryForFanOut: PresenceEntry = {
          identity,
          isConnected: true,
          data: safeLatestFrameToSend, // Use the debounced frame data
          lastSeen: updateTime,
        };

        const presenceChannelStub = _getPresenceChannelStub(state, env, organizationId, channel);

        // 3. Update global state (using the frame data)
        _updateGlobalPresence(
          ctx,
          presenceChannelStub,
          socketId,
          identity,
          presenceValueForGlobal,
          organizationId,
          channel,
        );

        // 4. Initiate Regional Fan-Out via Local Router (using fully merged data)
        const localRouterStub = getRouterStub(env, organizationId, region, logger);
        if (localRouterStub) {
          ctx.waitUntil(
            (localRouterStub as any)
              .publishPresenceUpdate({
                channel,
                socketId,
                presenceEntry: fullEntryForFanOut,
                originatingShardId: shardId,
              })
              .catch((err: unknown) => {
                logger.error('Failed to publish throttled/debounced presence update via router', {
                  channel: channel,
                  socketId: socketInfo.socketId,
                  identity: socketInfo.identity,
                  error: err,
                });
              }),
          );
        } else {
          logger.error(
            `Cannot fan out throttled/debounced setPresence for ${socketId}: Local router stub unavailable.`,
            { presenceKey },
          );
        }

        // 5. Broadcast Locally on Originating Shard (using fully merged data)
        broadcastLocalPresenceUpdate(
          shardContext,
          originatingSubscribers,
          originatingSocketIds,
          channel,
          identity, // identity is in scope here
          fullEntryForFanOut, // Use the same merged data
        );
        // ------------------------------------------------- //
      }, PRESENCE_THROTTLE_INTERVAL_MS); // Use the longer throttle interval here
    }
    // If already throttled, the latest completed frame is stored in pendingThrottledFrames
    // and will be picked up by the existing scheduled throttle setTimeout.
    // -------------------------- //
  }, PRESENCE_DEBOUNCE_FRAME_MS); // Use the short debounce interval here
  // -------------------------- //
}

/**
 * Handles presence updates when a socket disconnects.
 */
export async function handleDisconnectPresence(
  shardContext: ShardContext & { state: DurableObjectState },
  logger: Logger,
  socketInfo: SocketInfo,
  channels: string[],
  // Add originating shard's maps for local broadcast
  originatingSubscribers: Map<string, Set<WebSocket>>,
  originatingSocketIds: Map<WebSocket, string>,
): Promise<void> {
  const { env, ctx, organizationId, region, state, shardId } = shardContext;

  logger.info(
    `[PresenceService] Handling disconnect presence for ${socketInfo.socketId} (Identity: ${socketInfo.identity}) in shard ${shardId}`,
  );

  const routerStub = getRouterStub(env, organizationId, region, logger);
  if (!routerStub) {
    logger.error(
      `Cannot handle disconnect presence for ${socketInfo.socketId}: Local router stub unavailable.`,
    );
    // Potentially track error here
    return; // Cannot proceed without router
  }
  // Initialize router (caller - SocketShard - passes state which has waitUntil)
  // Use ctx from ShardContext which should implement DurableObjectCtx
  // Use 'any' to bypass strict type checking for stub methods
  ctx.waitUntil((routerStub as any).initialize({ organizationId, region }));

  for (const channel of channels) {
    logger.debug(
      `[PresenceService] Processing channel ${channel} for disconnect ${socketInfo.socketId}`,
    );
    const disconnectedPresenceValue: PresenceValue = {
      isConnected: false,
      data: {}, // Send empty data on disconnect
      lastSeen: Date.now(),
    };
    const fullDisconnectedEntry: PresenceEntry = {
      identity: socketInfo.identity,
      ...disconnectedPresenceValue,
    };

    const presenceChannelStub = _getPresenceChannelStub(state, env, organizationId, channel);
    _updateGlobalPresence(
      ctx,
      presenceChannelStub,
      socketInfo.socketId,
      socketInfo.identity,
      disconnectedPresenceValue,
      organizationId,
      channel,
    );

    // Broadcast disconnect presence
    broadcastLocalPresenceUpdate(
      shardContext,
      originatingSubscribers, // <-- Use passed map
      originatingSocketIds, // <-- Use passed map
      channel,
      socketInfo.identity,
      fullDisconnectedEntry,
    );

    // Fan out update via LOCAL router
    ctx.waitUntil(
      // Use 'any' to bypass strict type checking for stub methods
      (routerStub as any)
        .publishPresenceUpdate({
          channel,
          socketId: socketInfo.socketId,
          presenceEntry: fullDisconnectedEntry,
          originatingShardId: shardId,
        })
        .catch((err: unknown) => {
          logger.error('Failed to publish presence update via router on disconnect', {
            channel: channel,
            socketId: socketInfo.socketId,
            identity: socketInfo.identity,
            error: err,
          });
          // Optionally track error
        }),
    );
  }
}

/**
 * Handles a client request to get the full presence state for a channel.
 */
export async function handleGetPresence(
  shardContext: ShardContext & { state: DurableObjectState },
  logger: Logger,
  ws: WebSocket,
  channelName: string,
): Promise<void> {
  const { env, organizationId, shardId } = shardContext;
  console.log(
    `[PresenceService] Handling getPresence for channel ${channelName} from shard ${shardId}`,
  );
  const presenceChannelStub = _getPresenceChannelStub(
    shardContext.state,
    env,
    organizationId,
    channelName,
  );

  if (!presenceChannelStub) {
    console.error(
      `[PresenceService] Cannot get presence for ${channelName}: PRESENCE_CHANNEL stub unavailable.`,
    );
    ws.send(
      JSON.stringify({
        event: 'error',
        channel: channelName,
        message: 'Presence service unavailable',
      }),
    );
    return;
  }

  try {
    console.log(
      `[PresenceService] Requesting global state for ${channelName} from PresenceChannel DO`,
    );
    const globalState: Record<string, PresenceValue> = await (
      presenceChannelStub as any
    ).getState();
    console.log(`[PresenceService] Received global state for ${channelName}, sending to client.`);
    const response: PresenceStateMessage = {
      event: 'presenceState',
      channel: channelName,
      state: globalState,
    };

    // Defensive check for WebSocket state before sending
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    } else {
      logger.warn('Cannot send presenceState, WebSocket is not open', { channel: channelName });
    }
  } catch (err) {
    logger.error('Error getting presence state', err, { channel: channelName });
    // Track Error
    const errorEvent = trackErrorOccurred({
      context: 'presence_service_get_state',
      error: err instanceof Error ? err.message : String(err),
      organizationId: organizationId,
      details: { channel: channelName },
    });
    // Need ctx+env here - cannot send easily without passing ShardContext through?
    // For now, just log the error.

    console.error(
      `[PresenceService] Error getting state from PresenceChannel DO for ${channelName}:`,
      err,
    );
    const errorMessage = err instanceof Error ? err.message : 'Failed to retrieve presence state';
    ws.send(JSON.stringify({ event: 'error', channel: channelName, message: errorMessage }));
  }
}

/**
 * Broadcasts a received presence update to all local subscribers on the shard.
 */
export function broadcastLocalPresenceUpdate(
  shardContext: ShardContext,
  localSubscribers: Map<string, Set<WebSocket>>, // Main map from SocketShard
  localSocketIds: Map<WebSocket, string>,
  channel: string,
  identity: string,
  presenceEntry: PresenceEntry,
): void {
  // Get logger from context if possible, or create a basic one
  const logger = new Logger({
    context: {
      service: 'presence-service',
      shardId: shardContext.shardId,
      region: shardContext.region,
      action: 'broadcastLocalPresenceUpdate',
    },
  });

  const subscribers = localSubscribers.get(channel);
  if (!subscribers || subscribers.size === 0) {
    logger.debug('No local subscribers for channel, skipping broadcast', { channel, identity });
    return;
  }

  // Create the value part (without identity)
  const presenceValue: PresenceValue = {
    isConnected: presenceEntry.isConnected,
    data: presenceEntry.data,
    lastSeen: presenceEntry.lastSeen,
  };

  const updateMessage: PresenceUpdateMessage = {
    event: 'presenceUpdate',
    channel: channel,
    updates: { [identity]: presenceValue }, // Use the derived PresenceValue
    removals: [],
  };

  let messageString: string;
  try {
    messageString = JSON.stringify(updateMessage);
  } catch (e) {
    console.error(`[PresenceService] Failed to stringify presence update message:`, e);
    return; // Cannot proceed if stringify fails
  }

  // Iterate safely in case we modify the set during iteration
  const socketsToRemove = new Set<WebSocket>();
  subscribers.forEach((ws) => {
    const socketId = localSocketIds.get(ws) ?? 'unknown';
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageString);
      } catch (e) {
        console.error(
          `[PresenceService] Failed to broadcast presence update to socket ${socketId}. Closing and removing. Error:`,
          e,
        );
        // Mark for removal and attempt close
        socketsToRemove.add(ws);
        try {
          ws.close(1011, 'Presence broadcast failed');
        } catch {
          /* ignore close errors */
        }
      }
    } else {
      // Socket is not open, mark for removal
      console.warn(
        `[PresenceService] Socket ${socketId} not open during presence broadcast. Marking for removal.`,
      );
      socketsToRemove.add(ws);
    }
  });

  // Remove problematic sockets from the specific channel set
  socketsToRemove.forEach((ws) => subscribers.delete(ws));
}
