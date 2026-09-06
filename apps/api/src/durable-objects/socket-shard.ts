/**
 * SocketShard Durable Object
 *
 * Manages WebSocket connections, message delivery, and delegates presence handling.
 */
import { DurableObject } from 'cloudflare:workers';
import type {
  ChannelMessage,
  OutgoingChannelMessage,
  WelcomeMessage,
  PresenceEntry,
  ClientPresenceMessage, // Keep for parsing check maybe?
  SetPresenceMessage, // Keep for parsing check maybe?
  GetPresenceMessage, // Keep for parsing check maybe?
  PresenceStateMessage,
  PresenceUpdateMessage,
  UpdatePresencePayload,
  PresenceValue, // Ensure PresenceValue is imported if needed by service
} from '../types';
import { markRegionInactive } from '../utils/region';
import {
  handleConnectPresence,
  handleDisconnectPresence,
  handleGetPresence,
  handleSetPresence,
  broadcastLocalPresenceUpdate,
} from '../services/presence-service'; // Import service functions
import { DO_PREFIX, PRESENCE_THROTTLE_INTERVAL_MS, PRESENCE_DEBOUNCE_FRAME_MS } from '../constants'; // Import CORRECT constants
import {
  sendEvent,
  sendEventBatch,
  trackAggregateMessageDelivery,
  trackConnectionClosed,
  trackErrorOccurred,
} from '../services/analytics-service'; // Import analytics functions
import type { AnalyticsEvent } from '../services/analytics-service';
import { Logger, LogLevel } from '../utils/logger'; // Import logger and LogLevel

const SHARD_METADATA_KEY = 'shard_metadata';
const AGGREGATION_INTERVAL_SECONDS = 60; // Aggregate analytics every 60 seconds

// Define aggregation interval
// Helper function to safely stringify JSON
function safeStringify(data: unknown, fallback = '{}'): string {
  try {
    return JSON.stringify(data);
  } catch (e) {
    console.error(`[${DO_PREFIX.SOCKET_SHARD}] Failed to stringify data:`, e);
    return fallback;
  }
}

// Type guards remain useful here
function isSetPresenceMessage(msg: any): msg is SetPresenceMessage {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.event === 'setPresence' &&
    typeof msg.channel === 'string' &&
    'data' in msg
  );
}

function isGetPresenceMessage(msg: any): msg is GetPresenceMessage {
  return (
    msg && typeof msg === 'object' && msg.event === 'getPresence' && typeof msg.channel === 'string'
  );
}

export class SocketShard extends DurableObject<Env> {
  // Channel subscription tracking (in-memory for active sockets)
  #channelSubscribers = new Map<string, Set<WebSocket>>();

  // WebSocket metadata tracking (in-memory for active sockets)
  #socketChannels = new Map<WebSocket, Set<string>>();
  #socketIds = new Map<WebSocket, string>();
  #socketIdentities = new Map<WebSocket, string>();

  // --- Presence State (Local Cache) ---
  #channelPresence = new Map<string, Map<string, PresenceEntry>>();

  // --- State for Debouncing Presence Updates ---
  #pendingPresenceTimers = new Map<string, NodeJS.Timeout>();
  #latestPendingPresenceData = new Map<string, unknown>();

  // --- State for Rehydration ---
  // Persistent knowledge of socket subscriptions (socketId -> channels)
  #knownSocketChannels = new Map<string, Set<string>>();
  // --- State for Throttling+Debouncing Presence Updates ---
  #debounceTimers = new Map<string, NodeJS.Timeout>(); // Stores debounce timers
  #debouncedDataFrames = new Map<string, unknown>(); // Accumulates data during debounce
  #throttledPresenceKeys = new Set<string>(); // Tracks keys in throttle cooldown
  #pendingThrottledFrames = new Map<string, unknown>(); // Stores latest frame for throttle
  // --------------------------------------------------

  // Shard metadata
  #organizationId: string | undefined;
  #region: string | undefined;
  #shardNumericId: string | undefined;
  #shardId: string | undefined; // Full shard identifier

  // --- Analytics State ---
  #logger: Logger | undefined;
  #aggMsgData: Map<string, { messageCount: number; totalBytes: number }> = new Map(); // Key: `${organizationId}:${channel}`

  constructor(
    readonly state: DurableObjectState,
    readonly env: Env,
  ) {
    super(state, env);

    // Initialize Logger
    this.#logger = new Logger({
      minLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
      context: { doClass: 'SocketShard' },
    });

    // Load metadata and analytics snapshot during construction
    this.state.blockConcurrencyWhile(async () => {
      // blockConcurrencyWhile ensures this runs before fetch/alarm
      let loadedFromStorage = false;
      this.#logger?.debug('Constructor: Attempting to load metadata from storage...');
      try {
        const storedMetadata = await this.state.storage.get<{
          orgId: string;
          reg: string;
          numId: string;
          sId: string;
        }>(SHARD_METADATA_KEY);

        if (storedMetadata) {
          this.#organizationId = storedMetadata.orgId;
          this.#region = storedMetadata.reg;
          this.#shardNumericId = storedMetadata.numId;
          this.#shardId = storedMetadata.sId;
          loadedFromStorage = true;
          this.#logger?.info('Constructor: Successfully loaded metadata from storage.', {
            orgId: this.#organizationId,
            region: this.#region,
            shardNumId: this.#shardNumericId,
            shardIdStr: this.#shardId,
          });
        } else {
          this.#logger?.warn(
            'Constructor: No metadata found in storage (key: ' +
              SHARD_METADATA_KEY +
              '). Awaiting fetch/headers.',
          );
        }
      } catch (err) {
        this.#logger?.error('Constructor: Error loading metadata from storage:', err);
      }

      // Fallback log if loading failed
      if (!loadedFromStorage) {
        this.#logger?.debug(
          'Constructor: Metadata was not loaded from storage. Will rely on fetch headers for initialization.',
        );
      }

      // Final check if metadata is still missing after attempting load
      if (!this.#shardId) {
        // This might be expected if it's the very first activation before fetch runs
        this.#logger?.debug(
          'Constructor: shardId still missing after storage load attempt (expected on first activation).',
        );
      } else {
        // If we loaded successfully, update logger context immediately
        this.#logger = this.#logger?.withContext({
          orgId: this.#organizationId,
          region: this.#region,
          shardNumId: this.#shardNumericId,
          shardIdStr: this.#shardId,
        });
        this.#logger?.debug('Constructor: Logger context updated with loaded metadata.');
      }

      // --- Load Analytics Snapshot --- //
      try {
        const snapshot =
          await this.state.storage.get<
            Record<string, { messageCount: number; totalBytes: number }>
          >('agg_analytics_snapshot');
        if (snapshot && typeof snapshot === 'object' && Object.keys(snapshot).length > 0) {
          this.#logger?.info(
            `Restoring analytics aggregation snapshot (${Object.keys(snapshot).length} entries) from storage.`,
          );
          // Convert snapshot object back to Map
          this.#aggMsgData = new Map(Object.entries(snapshot));
          // Delete snapshot after loading to prevent reuse/double-counting
          await this.state.storage.delete('agg_analytics_snapshot');
        } else {
          // No snapshot or empty snapshot, ensure map is clean
          this.#aggMsgData = new Map();
        }
      } catch (err) {
        this.#logger?.error('Failed to load or process analytics aggregation snapshot', err);
        // Ensure map is clean if loading failed badly
        this.#aggMsgData = new Map();
        await this.state.storage.delete('agg_analytics_snapshot'); // Attempt delete anyway
      }
      // ----------------------------- //

      // Populate in-memory state based on persisted data and active sockets
      await this.#initializeAndRehydrateState();

      this.#logger?.debug('Constructor finished.');
    });
  }

  // --- Helper Methods (minimal, most moved to service) ---

  _getShardContext() {
    if (!this.#organizationId || !this.#region || !this.#shardId) {
      throw new Error('Shard context not fully initialized');
    }
    return {
      env: this.env,
      ctx: this.ctx,
      organizationId: this.#organizationId,
      region: this.#region,
      shardId: this.#shardId,
    };
  }

  // --- DurableObject Overrides ---

  override async fetch(req: Request): Promise<Response> {
    try {
      const headerSocketId = req.headers.get('x-socket-id');
      const headerIdentity = req.headers.get('x-identity');
      // Read headers for metadata - needed primarily for the *first* activation to save it
      const headerOrgId = req.headers.get('x-organization-id') ?? undefined;
      const headerRegion = req.headers.get('x-region') ?? undefined;
      const headerShardNumId = req.headers.get('x-shard-id') ?? undefined;
      const channelsRaw = req.headers.get('x-channels');

      const socketId = headerSocketId;
      const identity = headerIdentity;

      // Check required headers explicitly
      if (!socketId || !identity || !channelsRaw) {
        // Use potentially uninitialized shardId in log here
        console.error(
          `[${DO_PREFIX.SOCKET_SHARD}:${this.#shardId ?? 'init'}] Missing required connection headers`,
          {
            socketId: !!socketId,
            identity: !!identity,
            channelsRaw: !!channelsRaw,
          },
        );
        return new Response('Missing required connection metadata', { status: 400 });
      }

      // --- Ensure and Save Metadata on First Activation --- //
      // The constructor attempts loading. If it failed, headers are the source of truth.
      // We only need to PUT if it wasn't loaded successfully by the constructor.
      if (!this.#shardId && headerOrgId && headerRegion && headerShardNumId) {
        this.#organizationId = headerOrgId;
        this.#region = headerRegion;
        this.#shardNumericId = headerShardNumId;
        this.#shardId = `${DO_PREFIX.SOCKET_SHARD}:${headerOrgId}:${headerRegion}:${headerShardNumId}`;
        console.log(`[SocketShard:${this.#shardId}] Initializing metadata from headers.`);
        await this.state.storage.put(SHARD_METADATA_KEY, {
          orgId: this.#organizationId,
          reg: this.#region,
          numId: this.#shardNumericId,
          sId: this.#shardId,
        });
        console.log(`[SocketShard:${this.#shardId}] Saved metadata from headers to storage.`);
      } else if (!this.#shardId) {
        console.error(
          `[${DO_PREFIX.SOCKET_SHARD}:???] CRITICAL: Metadata still missing in fetch after constructor & header check.`,
        );
        // Cannot proceed without metadata
        return new Response('Internal server error: Shard initialization failed', { status: 500 });
      }
      // --------------------------------------------------- //

      // --- Update Logger Context --- //
      // Now that metadata is confirmed, update the logger context
      if (this.#logger && this.#organizationId && this.#region && this.#shardNumericId) {
        this.#logger = this.#logger.withContext({
          // Assuming withContext returns a new Logger
          orgId: this.#organizationId,
          region: this.#region,
          shardNumId: this.#shardNumericId,
          shardIdStr: this.#shardId, // Add full string ID if useful
        });
      } else if (this.#logger) {
        this.#logger.warn(
          'Logger context could not be fully updated due to missing metadata pieces.',
        );
      }
      // --------------------------- //

      let channels: string[];
      try {
        channels = JSON.parse(channelsRaw);
        if (!Array.isArray(channels)) throw new Error('Invalid channel format');
      } catch (err) {
        return new Response('Invalid x-channels format', { status: 400 });
      }

      // Accept WebSocket connection (socketId/identity are confirmed non-null here)
      const pair = new WebSocketPair();
      const [clientSocket, serverSocket] = Object.values(pair);
      // Tags are crucial for rehydration
      this.ctx.acceptWebSocket(serverSocket, [socketId, identity]);

      // Store mappings (in-memory)
      this.#socketIds.set(serverSocket, socketId);
      this.#socketIdentities.set(serverSocket, identity);

      // Subscribe (in-memory)
      for (const channel of channels) {
        this.#subscribe(serverSocket, channel);
      }

      // --- Persist subscription info for rehydration --- //
      const persistenceData = {
        channels,
        identity,
        connectedAt: Date.now(),
      };
      const storageKey = `socket:${socketId}`;
      try {
        this.#logger?.debug('Attempting to persist socket state', {
          storageKey,
          channels: persistenceData.channels,
          identity: persistenceData.identity,
        });
        await this.state.storage.put(storageKey, persistenceData);
        this.#logger?.info('Successfully persisted socket state', { storageKey });

        // --- TEST: Immediately try to read back the persisted data ---
        try {
          const readBack = await this.state.storage.get(storageKey);
          if (readBack) {
            this.#logger?.debug('Successfully read back persisted state immediately after put', {
              storageKey,
              readBackData: readBack,
            });
          } else {
            this.#logger?.warn(
              'Failed to read back persisted state immediately after put (get returned undefined/null)',
              { storageKey },
            );
          }
        } catch (readErr) {
          this.#logger?.error(
            'Error attempting to read back persisted state immediately after put',
            readErr,
            { storageKey },
          );
        }
        // ------------------------------------------------------------
      } catch (persistErr) {
        this.#logger?.error(
          'CRITICAL: Failed to persist socket state for rehydration',
          persistErr,
          { storageKey },
        );
        // Handle error appropriately - maybe close the socket?
        serverSocket.close(1011, 'Internal state error during persistence');
        return new Response('Internal server error', { status: 500 }); // Don't return 101
      }
      // ------------------------------------------------- //

      // --- Handle Presence --- //
      try {
        handleConnectPresence(
          { ...this._getShardContext(), state: this.state },
          this.#logger!,
          { socketId, identity },
          channels,
          this.#channelSubscribers, // Pass local maps
          this.#socketIds,
        );
      } catch (err) {
        console.error(
          `[${DO_PREFIX.SOCKET_SHARD}:${this.#shardId ?? 'error'}] Error during connect presence handling for ${socketId}:`,
          err,
        );
        // Decide if we should close the connection here
      }
      // --------------------------------------------- //

      // --- Send Welcome --- //
      const welcomeMsg: WelcomeMessage = {
        event: 'welcome',
        region: this.#region ?? 'unknown', // Use fallback
        socketId,
        channels,
      };
      serverSocket.send(safeStringify(welcomeMsg));

      // Set/Reset alarm for aggregate analytics whenever a connection occurs while testing.
      // This ensures any stale/distant alarm is overwritten with the desired interval.
      this.state.blockConcurrencyWhile(async () => {
        const currentLogger = this.#logger;
        const alarmTime = Date.now() + AGGREGATION_INTERVAL_SECONDS * 1000;
        currentLogger?.info('Setting/resetting analytics aggregation alarm on connection.', {
          alarmTime: new Date(alarmTime).toISOString(),
        });
        try {
          await this.state.storage.setAlarm(alarmTime);
          currentLogger?.info('Successfully set/reset alarm in fetch.');
        } catch (setAlarmErr) {
          currentLogger?.error('CRITICAL: Failed to set/reset alarm in fetch.', setAlarmErr);
        }
      });

      this.#logger?.info(
        // Use logger if available
        `WebSocket connected: ${socketId} (Identity: ${identity})`,
        { shardId: this.#shardId }, // Add shardId context
      );
      return new Response(null, { status: 101, webSocket: clientSocket });
    } catch (err) {
      this.#logger?.error(`Connection error:`, err, { shardId: this.#shardId ?? 'unknown' });
      // Attempt to track error using sendEvent if possible
      // Needs env, ctx, logger - might be hard to get reliably here
      // sendEvent(...);

      return new Response('Internal server error', { status: 500 });
    }
  }

  override async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    // --- Rehydrate on first message if needed --- //
    // This ensures that if a socket reconnects/sends a message *before* a publish occurs,
    // its state is restored correctly for handling presence messages etc.
    // Note: This might be slightly redundant if publish happens first, but safer.
    await this.#rehydrateSubscriptionsIfNeeded(ws);
    // -------------------------------------------- //

    const socketId = this.#socketIds.get(ws);
    const identity = this.#socketIdentities.get(ws);

    if (typeof msg !== 'string' || !socketId || !identity || !this.#shardId) {
      // Logging and return (as before)
      return;
    }

    try {
      const parsedMsg: unknown = JSON.parse(msg);
      // Basic validation (as before)
      if (
        typeof parsedMsg !== 'object' ||
        parsedMsg === null ||
        !('event' in parsedMsg) ||
        !('channel' in parsedMsg)
      ) {
        // Logging and error response (as before)
        return;
      }

      const message = parsedMsg as { event: string; channel: string; [key: string]: unknown };
      const { channel } = message;
      const socketChannels = this.#socketChannels.get(ws);

      // Check authorization
      if (!socketChannels?.has(channel)) {
        console.warn(
          `[SocketShard:${this.#shardId}] Socket ${socketId} tried to interact with unauthorized channel ${channel}`,
        );
        ws.send(safeStringify({ event: 'error', channel, message: 'Unauthorized channel' }));
        return;
      }

      // --- Delegate Presence Messages ---
      if (isSetPresenceMessage(message)) {
        handleSetPresence(
          { ...this._getShardContext(), state: this.state },
          this.#logger!,
          { socketId, identity },
          channel,
          message.data,
          this.#debounceTimers,
          this.#debouncedDataFrames,
          this.#throttledPresenceKeys,
          this.#pendingThrottledFrames,
          this.#channelSubscribers,
          this.#socketIds,
          PRESENCE_DEBOUNCE_FRAME_MS,
          PRESENCE_THROTTLE_INTERVAL_MS,
        );
      } else if (isGetPresenceMessage(message)) {
        console.log(
          `[SocketShard:${this.#shardId}] Received getPresence from ${socketId} for ${channel}`,
        );
        await handleGetPresence(
          { ...this._getShardContext(), state: this.state },
          this.#logger!,
          ws,
          channel,
        );
      } else {
        console.log(
          `[SocketShard:${this.#shardId}] Received unhandled message event: ${message.event}`,
        );
      }
      // ---------------------------------
    } catch (err) {
      console.error(
        `[SocketShard:${this.#shardId}] Error processing WebSocket message from ${socketId}:`,
        err,
        'Raw message:',
        msg,
      );
      try {
        ws.send(safeStringify({ event: 'error', message: 'Failed to process message' }));
      } catch (sendErr) {
        console.error(
          `[SocketShard:${this.#shardId}] Failed to send error message back to client:`,
          sendErr,
        );
      }
    }
  }

  override async webSocketClose(
    ws: WebSocket,
    code?: number,
    reason?: string,
    wasClean?: boolean,
  ): Promise<void> {
    const socketId = this.#socketIds.get(ws);
    const identity = this.#socketIdentities.get(ws);
    const channels = this.#socketChannels.get(ws);

    if (!socketId || !identity || !channels || !this.#shardId) {
      // Logging and return (as before)
      return;
    }

    console.log(
      `[SocketShard:${this.#shardId}] WebSocket closing: ${socketId} (Identity: ${identity}). Code: ${code}, Reason: ${reason}, Clean: ${wasClean}`,
    );

    // --- Delegate Presence Handling on Disconnect ---
    try {
      await handleDisconnectPresence(
        { ...this._getShardContext(), state: this.state },
        this.#logger!,
        { socketId, identity },
        channels ? [...channels] : [], // Convert Set to Array
        this.#channelSubscribers, // Pass local maps
        this.#socketIds,
      );
    } catch (err) {
      console.error(
        `[SocketShard:${this.#shardId}] Error during disconnect presence handling for ${socketId}:`,
        err,
      );
    }
    // ----------------------------------------------

    // Clean up subscriptions and decrement router count
    const routerStub = this.env.CHANNEL_ROUTER.get(
      this.env.CHANNEL_ROUTER.idFromName(`router:${this.#organizationId}:${this.#region}`),
    ) as any;

    for (const channel of channels) {
      const subscribers = this.#channelSubscribers.get(channel);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          console.log(
            `[SocketShard:${this.#shardId}] No more subscribers for channel ${channel}, unregistering.`,
          );
          this.#channelSubscribers.delete(channel);
          // Let PresenceChannel DO handle presence map expiry
          if (routerStub) {
            // Ensure router is initialized before calling unregister
            this.state.waitUntil(
              (routerStub as any)
                .initialize({ organizationId: this.#organizationId!, region: this.#region! })
                .then(() => {
                  // Now call unregister
                  return (routerStub as any).unregister({ channel, shardId: this.#shardId });
                })
                .catch((err: any) => {
                  this.#logger?.error(
                    'Failed to initialize or unregister channel router during socket close',
                    err,
                  );
                }),
            );
          }
        }
      }
    }

    // Clean up WebSocket-specific mappings
    this.#socketChannels.delete(ws);
    this.#socketIds.delete(ws);
    this.#socketIdentities.delete(ws);

    // Decrement connection count
    if (routerStub) {
      console.log(`[SocketShard:${this.#shardId}] Decrementing shard connection count.`);
      this.ctx.waitUntil(routerStub.decrementShardConnections({ shardId: this.#shardId }));
    }

    // --- Clean up persisted data & Track Close --- //
    let deletedPersistedKey = false;
    let connectedAt: number | undefined;
    if (socketId) {
      try {
        // --- Get connect time BEFORE deleting ---
        const persistedData = await this.state.storage.get<{
          connectedAt?: number;
          [key: string]: any;
        }>(`socket:${socketId}`);
        connectedAt = persistedData?.connectedAt;
        // ----------------------------------------

        // Attempt to delete the primary persisted record *before* tracking
        deletedPersistedKey = await this.state.storage.delete(`socket:${socketId}`);
        this.#knownSocketChannels.delete(socketId); // Clean up in-memory known channels map
      } catch (deleteErr) {
        this.#logger?.error(
          `Error accessing/deleting persisted socket state for ${socketId}`,
          deleteErr,
        );
        // Continue anyway, maybe alarm will clean it up
      }
    }

    // Only track the close event from webSocketClose if we successfully deleted the key.
    if (deletedPersistedKey) {
      if (this.#logger && this.#organizationId && this.#shardNumericId && connectedAt) {
        const durationMs = Date.now() - connectedAt; // Use retrieved timestamp
        const event = trackConnectionClosed({
          organizationId: this.#organizationId,
          socketId: socketId!, // socketId is checked non-null if deletedPersistedKey is true
          shardId: this.#shardNumericId,
          region: this.#region,
          identity: identity!, // identity is checked non-null earlier
          closeCode: code ?? 1005,
          reason: reason ?? 'No reason provided',
          durationMs: durationMs,
        });
        sendEvent(this.state, this.env, this.#logger, event); // Use logger safely
      } else {
        this.#logger?.warn(
          'Could not track connection close (key deleted) due to missing state/timing',
          {
            socketId,
            hasLogger: !!this.#logger,
            hasOrgId: !!this.#organizationId,
            hasShardNumId: !!this.#shardNumericId,
            hasConnectTime: !!connectedAt, // Check the retrieved timestamp
          },
        );
      }
    } else {
      // Log if we didn't track because the key was already deleted (likely by alarm)
      this.#logger?.info(
        `Skipping connection close tracking for ${socketId} in webSocketClose, persisted key already deleted (deletedPersistedKey: ${deletedPersistedKey}).`,
      );
    }
    // ------------------------------------------- //

    // --- Cancel Alarm if Last Connection --- //
    const remainingSockets = this.state.getWebSockets();
    if (remainingSockets.length === 0) {
      this.#logger?.info('Last WebSocket closed, deleting aggregation alarm'); // Use info level
      await this.state.storage.deleteAlarm();
    }
    // ---------------------------------------- //
  }

  override async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const socketId = this.#socketIds.get(ws);
    console.warn(
      `[SocketShard:${this.#shardId}] WebSocket error for ${socketId ?? 'unknown socket'}:`,
      error,
    );
    await this.webSocketClose(ws, 1011, 'WebSocket Error');

    // Track error
    if (this.#logger && this.#organizationId && this.#region && this.#shardNumericId) {
      const errorEvent = trackErrorOccurred({
        context: 'socket_shard_websocket_error',
        error: error instanceof Error ? error.message : String(error),
        organizationId: this.#organizationId,
        region: this.#region,
        details: {
          socketId: socketId ?? 'unknown',
          shardId: this.#shardNumericId,
          shardFullId: this.#shardId,
        },
      });
      sendEvent(this.state, this.env, this.#logger, errorEvent);
    } else {
      this.#logger?.warn('Could not track websocket error due to missing state', {
        socketId: socketId ?? 'unknown',
        hasLogger: !!this.#logger,
        hasOrgId: !!this.#organizationId,
        hasRegion: !!this.#region,
        hasShardNumId: !!this.#shardNumericId,
      });
    }
  }

  #subscribe(ws: WebSocket, channel: string): void {
    // Add to channel -> socket mapping (in-memory)
    const subscribers = this.#channelSubscribers.get(channel) ?? new Set<WebSocket>();
    subscribers.add(ws);
    this.#channelSubscribers.set(channel, subscribers);

    // Add to socket -> channel mapping (in-memory)
    const socketChannels = this.#socketChannels.get(ws) ?? new Set<string>();
    socketChannels.add(channel);
    this.#socketChannels.set(ws, socketChannels);

    // Log only if not already rehydrating (avoids spam)
    this.#logger?.debug(`Subscribed ${this.#socketIds.get(ws)} to ${channel}`);
  }

  /**
   * Method called by ChannelRouter to deliver presence updates from other shards.
   */
  async receivePresenceUpdate(payload: {
    channel: string;
    socketId: string; // Still received, but identity is primary
    presenceEntry: PresenceEntry;
    originatingShardId: string;
  }): Promise<void> {
    // Get channel directly from payload, identity from entry
    const { channel, originatingShardId, presenceEntry, socketId } = payload;
    const { identity } = presenceEntry;

    // REMOVED: Rehydration before receiving presence update caused potential recursion/
    // subrequest limits. Rely on maps being maintained by connection lifecycle.
    // await this.#rehydrateAllSubscriptions();

    // Update local presence cache using the service function
    // updateLocalPresence(this.#channelPresence, channel, identity, presenceEntry);

    // // Broadcast to local subscribers using the service function
    // broadcastLocalPresenceUpdate(
    //   this._getShardContext(),
    //   this.#channelSubscribers, // Pass the main map (now rehydrated)
    //   this.#socketIds,
    //   channel,
    //   identity,
    //   presenceEntry,
    // );
  }

  // --- Rehydration Logic ---

  /** Rehydrates a specific WebSocket if needed */
  async #rehydrateSubscriptionsIfNeeded(ws: WebSocket): Promise<void> {
    // If already hydrated or socket is already tracked, skip
    if (this.#socketIds.has(ws)) return;

    const tags = this.state.getTags(ws);
    if (tags && tags.length > 0) {
      const socketId = tags[0]; // Assuming socketId is the first tag
      const identity = tags[1]; // Assuming identity is the second tag

      // Ensure we have persisted data for this socketId
      const storedData = await this.state.storage.get<{ channels: string[]; identity?: string }>(
        `socket:${socketId}`,
      );
      const channels = storedData?.channels;

      if (channels && Array.isArray(channels)) {
        console.log(`[SocketShard:${this.#shardId}] Rehydrating single socket: ${socketId}`);
        // Rebuild in-memory maps for this specific socket
        this.#socketIds.set(ws, socketId);
        if (identity) this.#socketIdentities.set(ws, identity);

        for (const channel of channels) {
          this.#subscribe(ws, channel); // Updates #channelSubscribers & #socketChannels
        }
        // Add to known channels if not already there (e.g., if list() missed it somehow)
        if (!this.#knownSocketChannels.has(socketId)) {
          this.#knownSocketChannels.set(socketId, new Set(channels));
        }
      } else {
        console.warn(
          `[SocketShard:${this.#shardId}] RehydrateIfNeeded: No stored channel data found for active socket ${socketId}. Closing.`,
        );
        ws.close(1011, 'Internal state error');
      }
    } else {
      console.warn(
        `[SocketShard:${this.#shardId}] RehydrateIfNeeded: Active WebSocket found with missing/invalid tags. Closing.`,
      );
      ws.close(1011, 'Internal state error');
    }
  }

  // Renamed from #rehydrateAllSubscriptions
  async #initializeAndRehydrateState(): Promise<void> {
    this.#logger?.debug(`Running full initial state load and rehydration...`); // Use logger

    // 1. Load known channels for all potentially persisted sockets
    let storedEntries: [string, { channels: string[]; identity?: string }][] = []; // Type for clarity
    try {
      const storedMap = await this.state.storage.list<{ channels: string[]; identity?: string }>({
        prefix: 'socket:',
      });
      storedEntries = Array.from(storedMap.entries()); // Convert MapIterable to Array
      this.#logger?.debug(
        `Rehydrate: storage.list found ${storedEntries.length} persisted records.`,
        { keys: storedEntries.map(([k]) => k) },
      );
    } catch (err) {
      this.#logger?.error(`Rehydrate: Error during storage.list({ prefix: 'socket:' })`, err);
      // Decide if we should continue or throw? For now, log and continue with empty list.
      storedEntries = [];
    }

    this.#knownSocketChannels.clear(); // Start fresh
    for (const [key, value] of storedEntries) {
      if (!value || !Array.isArray(value.channels)) {
        this.#logger?.warn(`Rehydrate: Invalid stored data for key: ${key}`, { value });
        continue;
      }
      const { channels } = value;
      const socketId = key.slice('socket:'.length);
      this.#knownSocketChannels.set(socketId, new Set(channels));
    }
    this.#logger?.debug(
      `Rehydrate: Processed ${this.#knownSocketChannels.size} knownSocketChannels from storage.`,
    );

    // 2. Get currently active/hibernated WebSocket connections
    const activeWebSockets = this.state.getWebSockets();
    const activeSocketTags: { socketId: string; identity?: string }[] = [];
    for (const ws of activeWebSockets) {
      const tags = this.state.getTags(ws);
      if (tags && tags.length >= 1) {
        activeSocketTags.push({
          socketId: tags[0],
          identity: tags.length > 1 ? tags[1] : undefined,
        });
      } else {
        this.#logger?.warn(
          'Rehydrate: Active WebSocket found with missing/invalid tags during getWebSockets loop.',
        );
        // Optionally try to close it? ws.close(1011, 'State error');
      }
    }
    this.#logger?.debug(
      `Rehydrate: state.getWebSockets found ${activeWebSockets.length} active sockets.`,
      { activeTags: activeSocketTags },
    );

    // 3. Rebuild active state maps for existing connections
    // Reset in-memory maps before rebuilding from active sockets
    this.#channelSubscribers.clear();
    this.#socketChannels.clear();
    this.#socketIds.clear();
    this.#socketIdentities.clear();

    for (const ws of activeWebSockets) {
      const tags = this.state.getTags(ws);
      // Expecting [socketId, identity]
      if (tags && tags.length >= 1) {
        const socketId = tags[0];
        const identity = tags.length > 1 ? tags[1] : undefined;

        // Rebuild #socketIds & #socketIdentities
        this.#socketIds.set(ws, socketId);
        if (identity) this.#socketIdentities.set(ws, identity);

        const channels = this.#knownSocketChannels.get(socketId);
        if (channels) {
          // Rebuild #socketChannels and #channelSubscribers by re-subscribing
          for (const channel of channels) {
            this.#subscribe(ws, channel); // This updates both maps
          }
        } else {
          console.warn(
            `[${DO_PREFIX.SOCKET_SHARD}:${this.#shardId}] Active WebSocket ${socketId} found, but no channel data in storage/known map. Closing.`,
          );
          ws.close(1011, 'Internal state error');
        }
      } else {
        console.warn(
          `[${DO_PREFIX.SOCKET_SHARD}:${this.#shardId}] Active WebSocket found with missing/invalid tags during rehydration. Closing.`,
        );
        ws.close(1011, 'Internal state error');
      }
    }

    this.#logger?.info(
      `Rehydration complete. Active sockets: ${activeWebSockets.length}, Known socket IDs: ${this.#knownSocketChannels.size}`,
    );
  }

  // --- Standard Pub/Sub (Remains unchanged) ---
  async publishToChannel({ channel, payload }: ChannelMessage): Promise<void> {
    // --- Log Entry ---
    this.#logger?.debug('SocketShard.publishToChannel execution started', { channel });
    // ---------------

    // Ensure state is loaded before publishing --> REMOVED EXPLICIT REHYDRATION
    // await this.#rehydrateAllSubscriptions();

    const subscribers = this.#channelSubscribers.get(channel);
    const subscriberCount = subscribers?.size ?? 0;
    this.#logger?.debug('Checked channelSubscribers after rehydration', {
      channel,
      subscriberCount,
    });

    if (!subscribers || subscriberCount === 0) {
      // Use count for clarity
      this.#logger?.info(
        'No subscribers found in map for channel after rehydration. Returning early.',
        { channel },
      ); // Use logger
      return;
    }

    const message: OutgoingChannelMessage = {
      channel,
      payload,
      region: this.#region || '',
    };
    const messageString = safeStringify(message); // Use local safeStringify

    const socketsToRemove = new Set<WebSocket>();
    console.log(
      `[${DO_PREFIX.SOCKET_SHARD}:${this.#shardId}] Publishing to ${subscribers.size} subscribers for channel ${channel}`,
    );
    for (const socket of subscribers) {
      const socketId = this.#socketIds.get(socket) ?? 'unknown';

      // --- Logging: Check socket state before sending ---
      const currentState = socket.readyState;
      this.#logger?.debug('Checking socket state before send', {
        socketId,
        readyState: currentState,
      });
      // -------------------------------------------------

      if (currentState === WebSocket.OPEN) {
        // Explicitly check OPEN state
        try {
          // --- Logging: Attempting send ---
          this.#logger?.debug('Attempting socket.send()', { socketId, channel });
          socket.send(messageString);
          // --- Logging: Send successful (from DO perspective) ---
          this.#logger?.debug('socket.send() completed without error', { socketId, channel });

          // --- Aggregate Message Data --- //
          if (this.#organizationId) {
            // Ensure orgId is available
            const aggKey = `${this.#organizationId}:${channel}`;
            const currentAgg = this.#aggMsgData.get(aggKey) ?? { messageCount: 0, totalBytes: 0 };
            currentAgg.messageCount++;
            currentAgg.totalBytes += messageString.length;
            this.#aggMsgData.set(aggKey, currentAgg);
          } else {
            this.#logger?.warn('Cannot aggregate message data: organizationId missing.');
          }
          // ----------------------------- //
        } catch (err) {
          console.warn(
            `[SocketShard:${this.#shardId}] Failed to send pub/sub to ${socketId}. Closing and removing. Error:`,
            err,
          );
          socketsToRemove.add(socket);
          try {
            socket.close(1011, 'PubSub send failed');
          } catch {
            /* ignore close errors */
          }
        }
      } else {
        console.warn(
          `[SocketShard:${this.#shardId}] Socket ${socketId} not open during pub/sub. State: ${socket.readyState}. Marking for removal.`,
        );
        socketsToRemove.add(socket);
        // We might not need to explicitly close here if state is not OPEN
      }
    }

    // Remove problematic sockets from the channel set
    if (socketsToRemove.size > 0) {
      console.log(
        `[${DO_PREFIX.SOCKET_SHARD}:${this.#shardId}] Removing ${socketsToRemove.size} problematic sockets for channel ${channel}.`,
      );
      socketsToRemove.forEach((socket) => subscribers.delete(socket));
    }

    // Optional: Consider explicitly triggering webSocketClose logic for removed sockets
    // socketsToRemove.forEach(socket => {
    //   this.webSocketClose(socket, 1011, "Removed due to send failure", false);
    // });
  }

  /**
   * ALARM: Periodically send aggregated analytics data.
   */
  override async alarm(): Promise<void> {
    // Ensure logger and metadata are available (Initial Guard)
    if (!this.#logger || !this.#organizationId || !this.#shardId || !this.#shardNumericId) {
      // Attempt to load metadata again in case it failed in constructor but fetch succeeded later
      // This is a safety net, normally it should be loaded by now.
      await this.state.blockConcurrencyWhile(() => this.#loadMetadata());
      if (!this.#logger || !this.#organizationId || !this.#shardId || !this.#shardNumericId) {
        console.error(
          `[${DO_PREFIX.SOCKET_SHARD} Alarm] Metadata still missing after reload attempt. Cannot process alarm. DO ID: ${this.state.id.toString()}`,
        );
        // Do not reschedule alarm if basic state is missing after retry
        return;
      }
      this.#logger.warn(
        'Alarm ran with initially missing metadata, but loaded successfully on retry.',
      );
    }
    this.#logger.debug('Alarm triggered.');

    // --- Orphaned Connection Cleanup ---
    let cleanedOrphansCount = 0;
    try {
      this.#logger.debug('Starting orphaned connection cleanup check...');

      // --- DETAILED LOGGING --- >
      let activeSocketTags: { socketId: string; identity?: string }[] = [];
      let activeSocketsForLog: WebSocket[] = [];
      try {
        activeSocketsForLog = this.state.getWebSockets();
        for (const ws of activeSocketsForLog) {
          const tags = this.state.getTags(ws);
          if (tags && tags.length >= 1) {
            activeSocketTags.push({
              socketId: tags[0],
              identity: tags.length > 1 ? tags[1] : undefined,
            });
          }
        }
        this.#logger.debug(
          `Orphan Check: state.getWebSockets() found ${activeSocketsForLog.length} sockets.`,
          {
            activeTags: activeSocketTags,
          },
        );
      } catch (e) {
        this.#logger.error('Orphan Check: Error calling state.getWebSockets()', e);
      }

      let persistedKeysForLog: string[] = [];
      let persistedListCount = 0;
      try {
        const persistedMap = await this.state.storage.list({ prefix: 'socket:' });
        persistedKeysForLog = Array.from(persistedMap.keys());
        persistedListCount = persistedKeysForLog.length;
        this.#logger.debug(
          `Orphan Check: storage.list({prefix:'socket:'}) found ${persistedListCount} keys.`,
          {
            keys: persistedKeysForLog,
          },
        );
      } catch (e) {
        this.#logger.error("Orphan Check: Error calling storage.list({ prefix: 'socket:' })", e);
      }
      // --- END DETAILED LOGGING --- >

      // 1. Get active socket IDs
      const activeSockets = activeSocketsForLog; // Use the array already fetched
      const activeSocketIds = new Set<string>();
      for (const ws of activeSockets) {
        const tags = this.state.getTags(ws);
        if (tags && tags.length > 0) {
          activeSocketIds.add(tags[0]); // Assuming socketId is the first tag
        }
      }
      this.#logger.debug(`Found ${activeSocketIds.size} active/hibernated socket IDs.`);

      // 2. Get persisted socket IDs
      const persistedSockets = await this.state.storage.list<{
        identity?: string;
        connectedAt?: number;
        channels?: string[];
      }>({ prefix: 'socket:' });
      const persistedSocketIds = new Map<
        string,
        { identity?: string; connectedAt?: number; channels?: string[] }
      >();
      const persistedKeysToDelete: string[] = [];

      for (const [key, value] of persistedSockets.entries()) {
        const socketId = key.slice('socket:'.length);
        persistedSocketIds.set(socketId, value ?? {});
        persistedKeysToDelete.push(key); // Keep track of keys to potentially delete
      }
      this.#logger.debug(`Found ${persistedSocketIds.size} persisted socket records.`);

      // 3. Find and process orphans
      const orphanCleanupPromises: Promise<void>[] = [];
      const socketsToClean = new Map<
        string,
        { identity?: string; connectedAt?: number; channels?: string[] }
      >();

      for (const [socketId, data] of persistedSocketIds.entries()) {
        if (!activeSocketIds.has(socketId)) {
          socketsToClean.set(socketId, data);
        }
      }

      if (socketsToClean.size > 0) {
        this.#logger.info(`Found ${socketsToClean.size} orphaned socket records to clean up.`);
        cleanedOrphansCount = socketsToClean.size;

        // --- Get Local Router Stub Once ---
        let localRouterStub: DurableObjectStub | undefined;
        try {
          localRouterStub = this.env.CHANNEL_ROUTER.get(
            this.env.CHANNEL_ROUTER.idFromName(`router:${this.#organizationId!}:${this.#region!}`),
          );
          // Initialize router - needed if it wasn't active
          this.state.waitUntil(
            (localRouterStub as any).initialize({
              organizationId: this.#organizationId!,
              region: this.#region!,
            }),
          );
        } catch (routerErr) {
          this.#logger.error('Failed to get or initialize local router stub in alarm', routerErr);
          // Continue cleanup, but connection counts might remain inconsistent
        }
        // ---------------------------------

        for (const [socketId, data] of socketsToClean.entries()) {
          const identity = data.identity ?? 'unknown';
          const connectedAt = data.connectedAt;
          const channels = data.channels ?? [];

          // Track Close Event for Orphan
          // webSocketClose might not have run if the DO was evicted prematurely.
          const durationMs = connectedAt ? Date.now() - connectedAt : 0;
          const closeEvent = trackConnectionClosed({
            organizationId: this.#organizationId!,
            socketId: socketId,
            shardId: this.#shardNumericId!,
            region: this.#region,
            identity: identity,
            closeCode: 1006, // Abnormal Closure (or custom code)
            reason: 'Cleaned up by alarm (presumed closed)',
            durationMs: durationMs,
          });
          // Use waitUntil as these can happen concurrently
          this.state.waitUntil(sendEvent(this.state, this.env, this.#logger!, closeEvent));

          // Trigger Presence Disconnect
          if (identity !== 'unknown' && channels.length > 0) {
            this.state.waitUntil(
              handleDisconnectPresence(
                { ...this._getShardContext(), state: this.state },
                this.#logger!,
                { socketId, identity },
                channels,
                this.#channelSubscribers, // Pass local maps
                this.#socketIds,
              ).catch((err) => {
                this.#logger?.error(
                  `Error during alarm presence disconnect for orphaned socket ${socketId}`,
                  err,
                );
              }),
            );
          }

          // --- Decrement Router Connection Count ---
          if (localRouterStub) {
            this.#logger.debug(
              `Alarm: Decrementing router connection count for orphaned socket ${socketId} on shard ${this.#shardId}`,
            );
            this.state.waitUntil(
              (localRouterStub as any)
                .decrementShardConnections({ shardId: this.#shardId! }) // Use this shard's ID
                .catch((err: any) => {
                  this.#logger?.error(
                    `Alarm: Failed to decrement router connection count for orphan ${socketId}`,
                    err,
                  );
                  // Track error potentially
                }),
            );
          } else {
            this.#logger.warn(
              `Alarm: Cannot decrement router count for orphan ${socketId}, router stub unavailable.`,
            );
          }
          // ----------------------------------------

          // Delete persisted record (add to bulk delete list)
          // We already have the key in persistedKeysToDelete if socketId matches
        }

        // Bulk delete orphaned keys
        const keysToDelete = persistedKeysToDelete.filter((key) => {
          const socketId = key.slice('socket:'.length);
          return socketsToClean.has(socketId);
        });
        if (keysToDelete.length > 0) {
          this.#logger.info(
            `Deleting ${keysToDelete.length} persisted records for cleaned orphans.`,
          );
          // waitUntil for background deletion
          this.state.waitUntil(
            this.state.storage.delete(keysToDelete).catch((err) => {
              this.#logger?.error('Error bulk deleting orphaned socket keys', err);
            }),
          );
        }
      } else {
        this.#logger.debug('No orphaned socket records found.');
      }
    } catch (err) {
      this.#logger.error('Error during orphaned connection cleanup:', err);
      // Continue to analytics processing even if cleanup fails
    }
    // --- End Orphaned Connection Cleanup ---

    // --- Analytics Aggregation ---
    this.#logger.debug('Starting analytics aggregation processing.');
    const analyticsEvents: AnalyticsEvent[] = [];
    // Calculate the approximate start of the interval this alarm represents
    const intervalEndTs = new Date(); // Use current time as the end
    const intervalStartTs = new Date(intervalEndTs.getTime() - AGGREGATION_INTERVAL_SECONDS * 1000);

    for (const [aggKey, data] of this.#aggMsgData.entries()) {
      // Key is `${this.#organizationId}:${channel}`
      const channel = aggKey.substring(this.#organizationId.length + 1);

      if (data.messageCount > 0) {
        const event = trackAggregateMessageDelivery({
          organizationId: this.#organizationId!,
          shardId: this.#shardNumericId!,
          region: this.#region,
          channel: channel,
          intervalStartTs: intervalStartTs.toISOString(),
          intervalDurationS: AGGREGATION_INTERVAL_SECONDS,
          messageCount: data.messageCount,
          totalBytes: data.totalBytes,
        });
        analyticsEvents.push(event);
      }
    }

    if (analyticsEvents.length > 0) {
      this.#logger.info(
        `Processing ${analyticsEvents.length} aggregate analytic event(s) for interval.`,
      );

      // --- Step 1: Attempt Snapshot Persistence --- //
      let snapshotSaved = false;
      const snapshotData = Object.fromEntries(this.#aggMsgData);
      try {
        await this.state.storage.put('agg_analytics_snapshot', snapshotData);
        this.#logger.debug('Persisted analytics aggregation snapshot before sending.');
        snapshotSaved = true; // Mark as saved
      } catch (storageErr) {
        // Log critical error, but DO NOT return. We still want to try sending.
        this.#logger.error(
          'CRITICAL: Failed to persist analytics snapshot before sending. Attempting to send anyway.',
          storageErr,
        );
        // snapshotSaved remains false
      }
      // ------------------------------------------- //

      // --- Step 2: Attempt Sending Batch --- //
      let sendSucceeded = false;
      try {
        await sendEventBatch(this.state, this.env, this.#logger, analyticsEvents);
        this.#logger.info('Successfully sent aggregate analytics batch.');
        sendSucceeded = true;
      } catch (sendErr) {
        this.#logger.error(
          'Failed to send analytics event batch. Data will remain for next alarm cycle.',
          sendErr,
        );
        // sendSucceeded remains false
      }
      // ------------------------------------ //

      // --- Step 3: Cleanup based on Success --- //
      if (sendSucceeded) {
        // Clear the in-memory map *only* after successful send
        this.#aggMsgData.clear();

        // Delete the snapshot *only* after successful send (if it was saved)
        if (snapshotSaved) {
          try {
            await this.state.storage.delete('agg_analytics_snapshot');
            this.#logger.debug('Deleted analytics aggregation snapshot after successful send.');
          } catch (deleteErr) {
            this.#logger.error(
              'Failed to delete analytics snapshot after send (non-critical)',
              deleteErr,
            );
          }
        } else {
          // If send succeeded but snapshot save failed earlier, log that we are clearing memory anyway.
          this.#logger.warn(
            'Analytics sent successfully, but snapshot failed to save earlier. Clearing in-memory data.',
          );
        }
      }
      // --------------------------------------- //
    } else {
      this.#logger.debug('No aggregate data to send for this interval.');
    }

    // --- Step 4: Reschedule Alarm --- //
    // Reschedule if there are active sockets OR if we just cleaned up orphans
    // (in case more show up later or state needs settling).
    // Or perhaps always reschedule to ensure cleanup runs periodically? Let's always reschedule for now.
    this.#logger.debug('Determining if alarm needs rescheduling...');
    const activeSockets = this.state.getWebSockets();
    const activeSocketCount = activeSockets.length;
    this.#logger.debug(`Found ${activeSocketCount} active sockets.`);

    // Always reschedule the alarm to ensure periodic cleanup and analytics flush
    const nextAlarmTime = Date.now() + AGGREGATION_INTERVAL_SECONDS * 1000;
    try {
      await this.state.storage.setAlarm(nextAlarmTime);
      this.#logger.debug(
        `Alarm finished. Rescheduled for ${AGGREGATION_INTERVAL_SECONDS}s. Sockets: ${activeSocketCount}, Orphans Cleaned: ${cleanedOrphansCount}`,
        {
          alarmTime: new Date(nextAlarmTime).toISOString(),
        },
      );
    } catch (alarmErr) {
      this.#logger.error(
        'CRITICAL: Failed to set next alarm. Cleanup & Analytics aggregation will stop.',
        alarmErr,
      );
    }
    // ------------------------------ //
  }

  // Helper function to load metadata, used in constructor and alarm fallback
  async #loadMetadata(): Promise<void> {
    if (this.#shardId) return; // Already loaded

    try {
      const storedMetadata = await this.state.storage.get<{
        orgId: string;
        reg: string;
        numId: string;
        sId: string;
      }>(SHARD_METADATA_KEY);

      if (storedMetadata) {
        this.#organizationId = storedMetadata.orgId;
        this.#region = storedMetadata.reg;
        this.#shardNumericId = storedMetadata.numId;
        this.#shardId = storedMetadata.sId;
        this.#logger = this.#logger?.withContext({
          // Update logger context
          orgId: this.#organizationId,
          region: this.#region,
          shardNumId: this.#shardNumericId,
          shardIdStr: this.#shardId,
        });
        this.#logger?.info('Successfully loaded metadata during alarm/constructor.', {
          loadedIn: 'loadMetadata',
        });
      } else {
        this.#logger?.warn('No metadata found in storage during loadMetadata call.');
      }
    } catch (err) {
      this.#logger?.error('Error loading metadata from storage in loadMetadata:', err);
    }
  }
}
