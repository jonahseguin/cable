/**
 * PresenceChannel Durable Object
 *
 * Maintains the authoritative global presence state for a single channel
 * within a specific organization.
 */
import { DurableObject } from 'cloudflare:workers';
import type {
  PresenceEntry,
  UpdatePresencePayload,
  PresenceChannelMethods,
  PresenceValue,
} from '../types';
import {
  PRESENCE_TTL_MS,
  PRESENCE_CLEANUP_INTERVAL_MS,
  DO_PREFIX,
  KV_PREFIXES,
} from '../constants/index';

// Analytics Imports
import {
  sendEvent,
  trackErrorOccurred,
  trackAggregatePresenceActivity,
} from '../services/analytics-service';
import { Logger, LogLevel } from '../utils/logger';

// How long to keep presence data for disconnected users (in milliseconds)
// Example: 1 hour
// const PRESENCE_TTL_MS = 60 * 60 * 1000;

// How often to run the cleanup alarm (minimum 30 seconds for DOs)
// Example: 15 minutes
// const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

// Define the structure stored in the map (identity is the key)
// type PresenceValue = Omit<PresenceEntry, 'identity'>; // Already defined in types?

// --- Constants for Presence Analytics --- //
const PRESENCE_METADATA_KEY = 'presence_metadata';
const PRESENCE_AGG_SNAPSHOT_KEY = 'presence_agg_snapshot'; // Key for persisting agg counters
const PRESENCE_AGGREGATION_INTERVAL_SECONDS = 60;
// ---------------------------------------- //

export class PresenceChannel extends DurableObject<Env> implements PresenceChannelMethods {
  // State map: key is identity, value is { isConnected, data, lastSeen }
  #globalPresenceState = new Map<string, PresenceValue>();
  #stateLoaded = false;

  // --- Metadata & Logger --- //
  #organizationId: string | undefined;
  #channelName: string | undefined;
  #presenceChannelId: string;
  #logger: Logger;
  // ------------------------- //

  // --- Analytics Aggregation State --- //
  #aggJoins: number = 0;
  #aggLeaves: number = 0;
  // ----------------------------------- //

  // --- Cleanup Tracking --- //
  #lastCleanupTimestamp: number = 0; // Timestamp of the last cleanup run
  // ------------------------ //

  constructor(
    readonly state: DurableObjectState,
    readonly env: Env,
  ) {
    super(state, env);
    this.#presenceChannelId = this.state.id.toString();

    // Initialize Logger with base context
    this.#logger = new Logger({
      minLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
      context: {
        doClass: 'PresenceChannel',
        doIdShort: this.#presenceChannelId.slice(0, 8),
      },
    });

    // Load state non-blockingly
    this.state.blockConcurrencyWhile(async () => {
      await this.#loadState(); // Also ensures initial alarm
      // Attempt to load metadata persisted by initialize()
      await this.#loadMetadata();
      // Load analytics snapshot
      await this.#loadAnalyticsSnapshot();
      // Initialize cleanup timestamp (could load from storage if needed)
      this.#lastCleanupTimestamp = 0; // Reset on activation
    });
  }

  /** Load analytics snapshot */
  async #loadAnalyticsSnapshot(): Promise<void> {
    try {
      const snapshot = await this.state.storage.get<{ joins: number; leaves: number }>(
        PRESENCE_AGG_SNAPSHOT_KEY,
      );
      if (snapshot && (snapshot.joins > 0 || snapshot.leaves > 0)) {
        this.#logger?.info(`Restoring presence aggregation snapshot from storage.`, {
          joins: snapshot.joins,
          leaves: snapshot.leaves,
        });
        this.#aggJoins = snapshot.joins ?? 0;
        this.#aggLeaves = snapshot.leaves ?? 0;
        // Delete snapshot after loading
        await this.state.storage.delete(PRESENCE_AGG_SNAPSHOT_KEY);
      } else {
        // Reset counters if no valid snapshot
        this.#aggJoins = 0;
        this.#aggLeaves = 0;
      }
    } catch (err) {
      this.#logger?.error('Failed to load or process presence aggregation snapshot', err);
      // Ensure counters are reset if loading failed
      this.#aggJoins = 0;
      this.#aggLeaves = 0;
      await this.state.storage.delete(PRESENCE_AGG_SNAPSHOT_KEY); // Attempt delete anyway
    }
  }

  /**
   * Loads the presence state from durable storage.
   */
  async #loadState(): Promise<void> {
    if (this.#stateLoaded) return;

    // Load state using list() with the granular prefix
    this.#logger.debug('Loading granular presence state from storage...');
    this.#globalPresenceState.clear(); // Ensure map is empty before loading
    try {
      const storedEntries = await this.state.storage.list<PresenceValue>({ prefix: 'presence:' });
      let count = 0;
      for (const [key, value] of storedEntries) {
        // Extract identity from the key (e.g., 'presence:user123' -> 'user123')
        const identity = key.slice('presence:'.length);
        if (identity && value) {
          this.#globalPresenceState.set(identity, value);
          count++;
        } else {
          this.#logger.warn('Skipping invalid granular presence entry from storage', { key });
        }
      }
      this.#logger.debug(`Loaded ${count} presence entries granularly.`);
    } catch (err) {
      this.#logger.error('Failed to list granular presence state from storage', err);
      this.#trackError('list_presence_failed', err);
      // Depending on requirements, might want to clear the map again on error
      // this.#globalPresenceState.clear();
    }

    this.#stateLoaded = true;

    // Ensure alarm is set after loading state
    // This becomes the primary way the alarm is set initially or after eviction
    await this.#ensureAlarmIsScheduled();
  }

  /**
   * Persists the current presence state to durable storage.
   * DEPRECATED: granular puts/deletes are used instead.
   */
  // async #persistState(): Promise<void> {
  //   // Persist Map<identity, PresenceValue>
  //   await this.state.storage.put('globalPresenceState', [...this.#globalPresenceState.entries()]);
  // }

  /**
   * Loads OrgId and ChannelName from storage if previously initialized
   */
  async #loadMetadata(): Promise<void> {
    if (this.#organizationId && this.#channelName) return; // Already loaded/set

    try {
      const meta = await this.state.storage.get<{ orgId: string; channelName: string }>(
        PRESENCE_METADATA_KEY,
      );
      if (meta && meta.orgId && meta.channelName) {
        this.#organizationId = meta.orgId;
        this.#channelName = meta.channelName;
        // Update logger context
        this.#logger = this.#logger.withContext({
          orgId: this.#organizationId,
          channel: this.#channelName,
        });
        this.#logger.debug('Loaded presence metadata from storage.');
      } else {
        this.#logger.debug('Presence metadata not found in storage, awaiting initialization.');
      }
    } catch (err) {
      this.#logger.error('Failed to load presence metadata from storage', err);
    }
  }

  /**
   * Ensures the main alarm is scheduled if not already present.
   * This alarm handles both analytics and periodic cleanup.
   */
  async #ensureAlarmIsScheduled(): Promise<void> {
    const currentAlarm = await this.state.storage.getAlarm();
    if (currentAlarm === null) {
      const alarmTime = Date.now() + PRESENCE_AGGREGATION_INTERVAL_SECONDS * 1000;
      this.#logger.info('Setting initial/reactivation alarm', {
        alarmType: 'aggregation_and_cleanup',
        nextRun: new Date(alarmTime).toISOString(),
      });
      try {
        await this.state.storage.setAlarm(alarmTime);
      } catch (alarmErr) {
        this.#logger.error('CRITICAL: Failed to set initial/reactivation alarm.', alarmErr);
      }
    }
  }

  /**
   * Main alarm handler. Orchestrates analytics, cleanup, and rescheduling.
   */
  override async alarm(): Promise<void> {
    // Ensure metadata is available before proceeding
    await this.#loadMetadata();
    if (!this.#logger || !this.#organizationId || !this.#channelName) {
      this.#logger.error(
        // Use logger if available, otherwise console
        `Alarm aborted: Missing logger or metadata. Alarm will NOT be rescheduled. DO ID: ${this.state.id.toString()}`,
        {
          hasLogger: !!this.#logger,
          hasOrgId: !!this.#organizationId,
          hasChannel: !!this.#channelName,
        },
      );
      // Do not reschedule if basic state is missing
      return;
    }

    this.#logger.debug('Alarm triggered: Handling tasks...');

    // 1. Handle Analytics Aggregation & Sending
    await this.#handleAnalyticsAggregation();

    // 2. Handle Stale Presence Cleanup (Conditionally)
    const now = Date.now();
    if (now - this.#lastCleanupTimestamp > PRESENCE_CLEANUP_INTERVAL_MS) {
      this.#logger.info('Cleanup interval elapsed, running stale presence cleanup...');
      await this.#handleStalePresenceCleanup();
      this.#lastCleanupTimestamp = now; // Update timestamp only after successful cleanup run
      this.#logger.info('Stale presence cleanup finished.');
    } else {
      this.#logger.debug('Cleanup interval not yet elapsed, skipping cleanup.', {
        lastRun: new Date(this.#lastCleanupTimestamp).toISOString(),
        intervalMs: PRESENCE_CLEANUP_INTERVAL_MS,
      });
    }

    // 3. Reschedule the Alarm (if needed)
    await this.#rescheduleAlarm();

    this.#logger.debug('Alarm tasks complete.');
  }

  /** Handles aggregation and sending of presence analytics */
  async #handleAnalyticsAggregation(): Promise<void> {
    // Metadata check is done in the main alarm() now

    this.#logger.debug('Handling analytics aggregation part of alarm.');

    if (this.#aggJoins > 0 || this.#aggLeaves > 0) {
      const intervalEndTs = new Date();
      const intervalStartTs = new Date(
        intervalEndTs.getTime() - PRESENCE_AGGREGATION_INTERVAL_SECONDS * 1000,
      );

      // --- Create Snapshot Before Sending --- //
      let snapshotSaved = false;
      const snapshotData = { joins: this.#aggJoins, leaves: this.#aggLeaves };
      try {
        await this.state.storage.put(PRESENCE_AGG_SNAPSHOT_KEY, snapshotData);
        this.#logger.debug('Persisted presence aggregation snapshot before sending.');
        snapshotSaved = true;
      } catch (storageErr) {
        this.#logger.error(
          'CRITICAL: Failed to persist presence snapshot. Attempting to send anyway.',
          storageErr,
        );
      }
      // ------------------------------------ //

      const event = trackAggregatePresenceActivity({
        organizationId: this.#organizationId!, // Assert non-null as check is done in alarm()
        presenceChannelId: this.#presenceChannelId,
        channel: this.#channelName!, // Assert non-null
        intervalStartTs: intervalStartTs.toISOString(),
        intervalDurationS: PRESENCE_AGGREGATION_INTERVAL_SECONDS,
        joins: this.#aggJoins,
        leaves: this.#aggLeaves,
      });

      try {
        // Send event (using state which implements WaitUntilContext)
        await sendEvent(this.state, this.env, this.#logger, event);
        this.#logger.info('Sent aggregate presence activity analytics event.', {
          joins: this.#aggJoins,
          leaves: this.#aggLeaves,
        });

        // Reset counters *after* successful send
        const joinsSent = this.#aggJoins;
        const leavesSent = this.#aggLeaves;
        this.#aggJoins = 0;
        this.#aggLeaves = 0;

        // --- Delete Snapshot After Send --- //
        if (snapshotSaved) {
          try {
            await this.state.storage.delete(PRESENCE_AGG_SNAPSHOT_KEY);
            this.#logger.debug('Deleted presence aggregation snapshot after successful send.');
          } catch (deleteErr) {
            this.#logger.error(
              'Failed to delete presence snapshot after send (non-critical)',
              deleteErr,
            );
          }
        } else {
          this.#logger.warn(
            'Analytics sent, but snapshot failed to save earlier. Clearing counters anyway.',
          );
        }
        // -------------------------------- //
      } catch (sendErr) {
        this.#logger.error(
          'Failed to send aggregate presence analytics event. Counters NOT reset.',
          sendErr,
        );
        // Don't reset counters if send failed, retry on next alarm
      }
    } else {
      this.#logger.debug('No aggregate presence activity to send for this interval.');
    }
  }

  /** Handles cleanup of stale presence entries */
  async #handleStalePresenceCleanup(): Promise<void> {
    this.#logger.debug('Running stale presence cleanup logic...');
    // Ensure state is loaded - might be redundant if alarm guarantees state? Check DO docs.
    // Safer to ensure loaded state before manipulating it.
    await this.#loadState();

    const now = Date.now();
    // Use a longer TTL for potentially stale 'isConnected: true' entries
    // to avoid removing entries for hibernating sockets too aggressively.
    // Example: 2x the standard TTL used for disconnected entries.
    const staleTrueThreshold = PRESENCE_TTL_MS * 2;
    let changesMade = false;
    const deletePromises: Promise<boolean>[] = [];

    // Iterate through Map<identity, PresenceValue>
    for (const [identity, entry] of this.#globalPresenceState.entries()) {
      let shouldDelete = false;
      let reason = '';

      // Condition 1: Explicitly disconnected and TTL expired
      if (!entry.isConnected && now - entry.lastSeen > PRESENCE_TTL_MS) {
        shouldDelete = true;
        reason = `Disconnected TTL expired (lastSeen: ${new Date(entry.lastSeen).toISOString()})`;
      }
      // Condition 2: Still marked as connected, but lastSeen is very old (stale connection)
      else if (entry.isConnected && now - entry.lastSeen > staleTrueThreshold) {
        shouldDelete = true;
        reason = `Stale connection presumed dead (lastSeen: ${new Date(entry.lastSeen).toISOString()})`;
        this.#logger.warn(`Removing potentially stale connected entry for identity ${identity}.`, {
          entry,
        });
      }

      if (shouldDelete) {
        this.#logger.info(
          // Use info level for actual removals
          `Removing presence entry for identity ${identity}. Reason: ${reason}`,
        );
        this.#globalPresenceState.delete(identity); // Delete from in-memory map
        changesMade = true;
        // Schedule granular deletion from storage
        deletePromises.push(this.state.storage.delete(`presence:${identity}`));
        // Note: We decided not to broadcast removals from here initially.
      }
    }

    if (changesMade) {
      // Wait for all deletions to settle
      const results = await Promise.allSettled(deletePromises);
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          // Find the identity corresponding to the failed promise index (requires matching order)
          const failedIdentity = Array.from(this.#globalPresenceState.keys())[index]; // This is fragile if map changed during await
          // A safer way might be to store identities along with promises
          this.#logger.error(
            `Failed to delete stale presence entry for identity index ${index}`,
            result.reason,
          );
          this.#trackError('stale_cleanup_delete_failed', result.reason, { identityIndex: index });
        }
      });
      this.#logger.info(
        `Stale presence cleanup finished. ${deletePromises.length} deletions attempted.`,
      );
    } else {
      this.#logger.debug(`Stale presence cleanup finished. No changes made.`);
    }
  }

  /** Reschedules the main alarm if the presence map is not empty */
  async #rescheduleAlarm(): Promise<void> {
    // Ensure map state is current before checking size
    await this.#loadState();
    if (this.#globalPresenceState.size > 0) {
      const nextAlarmTime = Date.now() + PRESENCE_AGGREGATION_INTERVAL_SECONDS * 1000;
      try {
        await this.state.storage.setAlarm(nextAlarmTime);
        this.#logger.debug('Rescheduled alarm as presence map is not empty.', {
          alarmType: 'aggregation_and_cleanup',
          nextRun: new Date(nextAlarmTime).toISOString(),
        });
      } catch (alarmErr) {
        this.#logger.error(
          'CRITICAL: Failed to reschedule alarm. Aggregation & cleanup will stop.',
          alarmErr,
        );
      }
    } else {
      this.#logger.info('Presence map is empty, not rescheduling alarm.');
      // Optional: Explicitly delete alarm here? The runtime might do it anyway.
      // await this.state.storage.deleteAlarm();
    }
  }

  // --- Public Methods (callable via RPC/fetch) ---

  /**
   * Updates or adds a presence entry.
   * Caller must provide organizationId and channelName.
   */
  async updatePresenceEntry(payload: UpdatePresencePayload): Promise<void> {
    await this.#loadState(); // Ensure state is loaded

    // Destructure including new context fields
    const { identity, entry: partialEntry, socketId, organizationId, channelName } = payload;
    const partialData = partialEntry.data;

    // Validation (check if context was provided)
    if (!organizationId || !channelName) {
      console.error(
        // Use console.error if logger potentially not ready yet
        `[PresenceChannel:${this.state.id}] Cannot process update: Missing organizationId or channelName in payload.`,
      );
      // Track error - missing context in payload is a specific failure type
      this.#trackError(
        'update_presence_entry_missing_context',
        new Error('Missing orgId or channelName in payload'),
        { socketId },
      );
      return;
    }

    // Ensure metadata is loaded/set, especially if this is the first interaction
    await this.#loadMetadata();
    if (!this.#organizationId || !this.#channelName) {
      // Attempt to initialize if metadata is missing, assuming payload has it
      this.#logger.warn(
        'Metadata missing during updatePresenceEntry, attempting implicit initialization from payload.',
      );
      await this.initialize({ organizationId, channelName });
      // Re-check after initialize attempt
      if (!this.#organizationId || !this.#channelName) {
        this.#logger.error(
          'Implicit initialization failed during updatePresenceEntry. Cannot proceed.',
        );
        this.#trackError(
          'update_presence_entry_init_failed',
          new Error('Metadata missing and implicit init failed'),
          { socketId, identity },
        );
        return;
      }
    }

    // Get current state BEFORE updating, for comparison
    const currentEntry = this.#globalPresenceState.get(identity);
    const wasConnected = currentEntry?.isConnected ?? false;

    // --- Merge with existing state ---
    const currentData = currentEntry?.data ?? {}; // Get current data, default {} if no entry
    // Ensure both current and partial are treated as objects for merging
    const safeCurrentData =
      typeof currentData === 'object' && currentData !== null ? currentData : {};
    const safePartialData =
      typeof partialData === 'object' && partialData !== null ? partialData : {};
    const mergedData = { ...safeCurrentData, ...safePartialData };
    // ---------------------------------

    // Construct the full new entry with merged data and latest timestamps/status
    const newEntryValue: PresenceValue = {
      isConnected: partialEntry.isConnected, // Use status from payload
      lastSeen: partialEntry.lastSeen, // Use timestamp from payload
      data: mergedData, // Use the merged data
    };

    // Update state map
    this.#globalPresenceState.set(identity, newEntryValue);
    const isNowConnected = newEntryValue.isConnected;

    this.#logger.debug(
      // Use debug for entry updates
      `Updated entry for identity ${identity}. isConnected: ${newEntryValue.isConnected}`,
      { channel: channelName },
    );

    // --- Aggregate Analytics --- //
    if (wasConnected !== isNowConnected) {
      if (isNowConnected) {
        this.#aggJoins++;
        this.#logger.debug('Incremented aggJoins', { identity });
      } else {
        this.#aggLeaves++;
        this.#logger.debug('Incremented aggLeaves', { identity });
      }
    }
    // ------------------------ //

    // Persist changes granularly (use await instead of waitUntil)
    try {
      // Use identity as the key for granular storage
      const storageKey = `presence:${identity}`;
      await this.state.storage.put(storageKey, newEntryValue);
      this.#logger.debug('Persisted granular presence update', { identity });
    } catch (persistErr) {
      this.#logger.error('Failed to persist granular state after presence update', {
        identity,
        persistErr,
      });
      this.#trackError('granular_put_failed', persistErr, { identity });
      // If persist fails, subsequent loads will have stale data, but continue for now.
    }

    // Global fan-out was removed in Phase 1
  }

  /**
   * Retrieves the current global presence state for this channel.
   */
  async getState(): Promise<Record<string, PresenceValue>> {
    await this.#loadState(); // Ensure state is loaded

    this.#logger.debug(
      // Use debug level for getState calls
      `getState called. Returning state for ${this.#globalPresenceState.size} identities.`,
      { channel: this.#channelName },
    );
    // Convert Map<identity, PresenceValue> to plain object
    return Object.fromEntries(this.#globalPresenceState);
  }

  /**
   * Initializes the presence channel with necessary metadata. Should be called by the service
   * that first obtains the stub for this instance.
   * Idempotent: Stores metadata and sets initial alarm only if not already present.
   */
  async initialize(metadata: { organizationId: string; channelName: string }): Promise<void> {
    // Attempt load meta first - handles idempotency check
    await this.#loadMetadata();
    if (this.#organizationId && this.#channelName) {
      this.#logger.debug('Presence metadata already initialized or loaded.');
      // Ensure alarm is set anyway, as this might be called after eviction
      await this.#ensureAlarmIsScheduled();
      return;
    }

    const { organizationId, channelName } = metadata;
    if (!organizationId || !channelName) {
      this.#logger.error('Initialize called with invalid metadata', {
        providedOrgId: organizationId,
        providedChannel: channelName,
      });
      return;
    }

    this.#logger.info('Initializing presence metadata...', { organizationId, channelName });

    this.#organizationId = organizationId;
    this.#channelName = channelName;
    // Update logger context immediately
    this.#logger = this.#logger.withContext({
      orgId: this.#organizationId,
      channel: this.#channelName,
    });

    try {
      await this.state.storage.put(PRESENCE_METADATA_KEY, {
        orgId: organizationId,
        channelName: channelName,
      });
      this.#logger.info('Presence metadata initialized and persisted.');
      // Set the alarm after successful initialization
      await this.#ensureAlarmIsScheduled();
    } catch (err) {
      this.#logger.error('Failed to persist presence metadata during initialization', err);
      // If persistence fails, the metadata might be lost on next activation.
      // Alarm might not get set correctly if ensureAlarm fails.
    }
  }

  /** Helper to track errors consistently */
  #trackError(contextSuffix: string, error: Error | unknown, details?: Record<string, any>): void {
    if (!this.#logger) {
      console.error('Logger not initialized, cannot track error', error);
      return;
    }

    const event = trackErrorOccurred({
      context: `presence_channel_${contextSuffix}`,
      error: error instanceof Error ? error.message : String(error),
      organizationId: this.#organizationId, // Use loaded orgId if available
      details: {
        channel: this.#channelName, // Use loaded channelName if available
        presenceId: this.#presenceChannelId,
        ...(details ?? {}),
      },
    });
    // Use state for waitUntil context
    sendEvent(this.state, this.env, this.#logger, event);
  }
}
