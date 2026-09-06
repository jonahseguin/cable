import type { Logger } from '../utils/logger';

const TINYBIRD_BATCH_SIZE = 10; // Send events in batches

// --- Context Interface for waitUntil ---
interface WaitUntilContext {
  waitUntil(promise: Promise<any>): void;
}

const TINYBIRD_FLUSH_INTERVAL_MS = 5000; // Or every 5 seconds

// --- Utility for Key Conversion ---
function toSnakeCase(str: string): string {
  // Handles common cases like ID -> id, URL -> url, and regular camelCase
  return str.replace(/[A-Z]/g, (letter, index) => {
    // Handle acronyms like ID or URL at the start or preceded by another uppercase letter
    if (index > 0 && str[index - 1] >= 'A' && str[index - 1] <= 'Z') {
      // If part of an acronym (e.g., the D in ID), keep it uppercase unless it's the last letter
      // This part is tricky, aiming for simple common cases: UserID -> user_id, R2Key -> r2_key
      // A simpler approach might be better if complex acronyms aren't common.
      return `_${letter.toLowerCase()}`; // Simplified: just lowercase with underscore
    } else {
      return `${index === 0 ? '' : '_'}${letter.toLowerCase()}`;
    }
  });
}

function convertKeysToSnakeCase(obj: any): any {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj; // Return non-objects or arrays as is
  }
  // Handle boolean conversion specifically
  if (typeof obj === 'boolean') {
    return obj ? 1 : 0;
  }
  const newObj: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      // Convert boolean values to 0 or 1
      const convertedValue =
        typeof value === 'boolean' ? (value ? 1 : 0) : convertKeysToSnakeCase(value);
      newObj[toSnakeCase(key)] = convertedValue;
    }
  }
  return newObj;
}

// === Event Type Definitions ===

export interface BaseAnalyticsEvent {
  source: 'worker' | 'do';
  event_type: string;
  timestamp: string; // ISO 8601
  organization_id?: string;
}

// --- Connection Events ---
export interface ConnectionEstablishedEvent extends BaseAnalyticsEvent {
  event_type: 'connection_established';
  socket_id: string;
  region?: string; // <-- Add region
  shard_id: string;
  identity: string;
}

export interface ConnectionFailedValidationEvent extends BaseAnalyticsEvent {
  event_type: 'connection_failed_validation';
  reason: string;
  token_prefix?: string;
}

export interface ConnectionClosedEvent extends BaseAnalyticsEvent {
  event_type: 'connection_closed';
  socket_id: string;
  shard_id: string;
  region?: string; // <-- Add region
  identity: string;
  close_code: number;
  reason: string;
  duration_ms: number;
}

// --- Message Events ---
export interface AggregateMessageDeliveryEvent extends BaseAnalyticsEvent {
  event_type: 'aggregate_message_delivery';
  shard_id: string;
  region?: string; // <-- Add region
  channel: string;
  interval_start_ts: string;
  interval_duration_s: number;
  message_count: number;
  total_bytes: number;
}

// --- Presence Events ---
export interface AggregatePresenceActivityEvent extends BaseAnalyticsEvent {
  event_type: 'aggregate_presence_activity';
  presence_channel_id: string;
  channel: string;
  interval_start_ts: string;
  interval_duration_s: number;
  joins: number;
  leaves: number;
}

// --- Error Events ---
export interface ErrorOccurredEvent extends BaseAnalyticsEvent {
  event_type: 'error_occurred';
  context: string;
  error: string;
  region?: string; // <-- Add region
  details?: Record<string, any>;
}

// --- Message Events (Additional) ---
// These are specific actions, distinct from aggregate delivery
export interface MessagePublishedApiEvent extends BaseAnalyticsEvent {
  event_type: 'message_published_api';
  channel: string;
  payload_size: number;
  persist: boolean;
}

export interface MessageQueuedPersistenceEvent extends BaseAnalyticsEvent {
  event_type: 'message_queued_persistence';
  channel: string;
  message_id: string;
}

export interface MessagePersistedR2Event extends BaseAnalyticsEvent {
  event_type: 'message_persisted_r2';
  channel: string;
  message_id: string;
  r2_key: string;
  size_bytes: number;
}

export interface MessagePersistenceFailedR2Event extends BaseAnalyticsEvent {
  event_type: 'message_persistence_failed_r2';
  channel: string;
  message_id?: string;
  r2_key?: string;
  error: string;
}

// --- History Events ---
export interface HistoryRequestedEvent extends BaseAnalyticsEvent {
  event_type: 'history_requested';
  channel: string;
  limit: number;
  has_cursor: boolean;
}

// --- Router Events ---
export interface ChannelRegisteredEvent extends BaseAnalyticsEvent {
  event_type: 'channel_registered';
  channel: string;
  router_id: string; // ID of the ChannelRouter DO
}

export interface ChannelUnregisteredEvent extends BaseAnalyticsEvent {
  event_type: 'channel_unregistered';
  channel: string;
  router_id: string; // ID of the ChannelRouter DO
}

// Union type for all events
export type AnalyticsEvent =
  | ConnectionEstablishedEvent
  | ConnectionFailedValidationEvent
  | ConnectionClosedEvent
  | AggregateMessageDeliveryEvent
  | AggregatePresenceActivityEvent
  | ErrorOccurredEvent
  | MessagePublishedApiEvent
  | MessageQueuedPersistenceEvent
  | MessagePersistedR2Event
  | MessagePersistenceFailedR2Event
  | HistoryRequestedEvent
  | ChannelRegisteredEvent
  | ChannelUnregisteredEvent;

// --- Core Tracking Function ---

async function sendEventsToTinybird(
  env: Env,
  logger: Logger,
  events: AnalyticsEvent[],
): Promise<void> {
  if (!env.TINYBIRD_URL || !env.TINYBIRD_TOKEN) {
    logger.warn('Tinybird environment variables not set. Skipping event batch sending.');
    return;
  }
  if (events.length === 0) {
    return;
  }

  // Get environment from wrangler bindings (default to 'unknown')
  const environment =
    (env as any).ENVIRONMENT ?? (env as any).NODE_ENV ?? process.env.NODE_ENV ?? 'development';

  let requestBody: string;

  // Always format as NDJSON, even for a single event
  requestBody =
    events
      .map((event) => {
        // Add environment field to each event
        // Conditionally add environment only if it's not null
        const eventToSend = { ...event };
        if (environment !== null) {
          (eventToSend as any).environment = environment;
        }
        return JSON.stringify(convertKeysToSnakeCase(eventToSend));
      })
      .join('\n') + '\n';

  const contentType = 'application/x-ndjson'; // Always use NDJSON content type

  logger.debug(`Sending ${events.length} event(s) as NDJSON to Tinybird.`);

  try {
    const response = await fetch(env.TINYBIRD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        Authorization: `Bearer ${env.TINYBIRD_TOKEN}`,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Failed to send event batch to Tinybird (${response.status})`, {
        requestBody: requestBody.length > 1000 ? requestBody.slice(0, 1000) + '...' : requestBody,
        status: response.status,
        errorBody: errorBody.slice(0, 500), // Avoid logging huge responses
        eventCount: events.length,
        firstEventType: events[0]?.event_type,
      });
    } else {
      logger.debug(`Event batch (${events.length} events) sent to Tinybird successfully`, {
        firstEventType: events[0]?.event_type,
      });
    }
  } catch (error: unknown) {
    logger.error(
      'Network error sending event batch to Tinybird',
      error instanceof Error ? error : new Error(String(error)),
      { eventCount: events.length, firstEventType: events[0]?.event_type },
    );
  }
}

// === Tracking Functions ===

function createBaseEvent(source: 'worker' | 'do', organizationId?: string): BaseAnalyticsEvent {
  return {
    source,
    event_type: 'unknown', // Will be overridden
    timestamp: new Date().toISOString(),
    organization_id: organizationId,
  };
}

export function trackConnectionEstablished({
  organizationId,
  socketId,
  region,
  shardId,
  identity,
}: {
  organizationId: string;
  socketId: string;
  region?: string; // <-- Add region
  shardId: string;
  identity: string;
}): ConnectionEstablishedEvent {
  return {
    ...createBaseEvent('worker', organizationId),
    event_type: 'connection_established',
    socket_id: socketId,
    region: region, // <-- Use region
    shard_id: shardId,
    identity: identity,
  };
}

export function trackConnectionFailedValidation({
  reason,
  tokenPrefix,
}: {
  reason: string;
  tokenPrefix?: string;
}): ConnectionFailedValidationEvent {
  return {
    ...createBaseEvent('worker'), // Org ID not available here
    event_type: 'connection_failed_validation',
    reason: reason,
    token_prefix: tokenPrefix,
  };
}

export function trackConnectionClosed({
  organizationId,
  socketId,
  shardId,
  region, // <-- Add region
  identity,
  closeCode,
  reason,
  durationMs,
}: {
  organizationId: string;
  socketId: string;
  shardId: string;
  region?: string; // <-- Add region
  identity: string;
  closeCode: number;
  reason: string;
  durationMs: number;
}): ConnectionClosedEvent {
  return {
    ...createBaseEvent('do', organizationId),
    event_type: 'connection_closed',
    socket_id: socketId,
    shard_id: shardId,
    region: region, // <-- Use region
    identity: identity,
    close_code: closeCode,
    reason: reason,
    duration_ms: durationMs,
  };
}

export function trackAggregateMessageDelivery({
  organizationId,
  shardId,
  region, // <-- Add region
  channel,
  intervalStartTs,
  intervalDurationS,
  messageCount,
  totalBytes,
}: {
  organizationId: string;
  shardId: string;
  region?: string; // <-- Add region
  channel: string;
  intervalStartTs: string;
  intervalDurationS: number;
  messageCount: number;
  totalBytes: number;
}): AggregateMessageDeliveryEvent {
  return {
    ...createBaseEvent('do', organizationId),
    event_type: 'aggregate_message_delivery',
    shard_id: shardId,
    region: region, // <-- Use region
    channel: channel,
    interval_start_ts: intervalStartTs,
    interval_duration_s: intervalDurationS,
    message_count: messageCount,
    total_bytes: totalBytes,
  };
}

export function trackAggregatePresenceActivity({
  organizationId,
  presenceChannelId,
  channel,
  intervalStartTs,
  intervalDurationS,
  joins,
  leaves,
}: {
  organizationId: string;
  presenceChannelId: string;
  channel: string;
  intervalStartTs: string;
  intervalDurationS: number;
  joins: number;
  leaves: number;
}): AggregatePresenceActivityEvent {
  return {
    ...createBaseEvent('do', organizationId),
    event_type: 'aggregate_presence_activity',
    presence_channel_id: presenceChannelId,
    channel: channel,
    interval_start_ts: intervalStartTs,
    interval_duration_s: intervalDurationS,
    joins: joins,
    leaves: leaves,
  };
}

export function trackErrorOccurred({
  context,
  error,
  organizationId,
  region, // <-- Add region
  details,
}: {
  context: string;
  error: string;
  organizationId?: string;
  region?: string; // <-- Add region
  details?: Record<string, any>;
}): ErrorOccurredEvent {
  return {
    ...createBaseEvent('do', organizationId),
    event_type: 'error_occurred',
    context: context,
    error: error,
    region: region, // <-- Use region
    details: details,
  };
}

// --- Message Tracking Functions ---
export function trackMessagePublishedApi({
  organizationId,
  channel,
  payloadSize,
  persist,
}: {
  organizationId: string;
  channel: string;
  payloadSize: number;
  persist: boolean;
}): MessagePublishedApiEvent {
  return {
    ...createBaseEvent('worker', organizationId), // Assuming called from worker context
    event_type: 'message_published_api',
    channel: channel,
    payload_size: payloadSize,
    persist: persist,
  };
}

export function trackMessageQueuedPersistence({
  organizationId,
  channel,
  messageId,
}: {
  organizationId: string;
  channel: string;
  messageId: string;
}): MessageQueuedPersistenceEvent {
  return {
    ...createBaseEvent('worker', organizationId), // Or 'do' if queued from DO?
    event_type: 'message_queued_persistence',
    channel: channel,
    message_id: messageId,
  };
}

export function trackMessagePersistedR2({
  organizationId,
  channel,
  messageId,
  r2Key,
  sizeBytes,
}: {
  organizationId: string;
  channel: string;
  messageId: string;
  r2Key: string;
  sizeBytes: number;
}): MessagePersistedR2Event {
  return {
    ...createBaseEvent('worker', organizationId), // Assuming persistence worker
    event_type: 'message_persisted_r2',
    channel: channel,
    message_id: messageId,
    r2_key: r2Key,
    size_bytes: sizeBytes,
  };
}

export function trackMessagePersistenceFailedR2({
  organizationId,
  channel,
  messageId,
  r2Key,
  error,
}: {
  organizationId: string;
  channel: string;
  messageId?: string;
  r2Key?: string;
  error: string;
}): MessagePersistenceFailedR2Event {
  return {
    ...createBaseEvent('worker', organizationId), // Assuming persistence worker
    event_type: 'message_persistence_failed_r2',
    channel: channel,
    message_id: messageId,
    r2_key: r2Key,
    error: error,
  };
}

// --- History Tracking Functions ---
export function trackHistoryRequested({
  organizationId,
  channel,
  limit,
  hasCursor,
}: {
  organizationId: string;
  channel: string;
  limit: number;
  hasCursor: boolean;
}): HistoryRequestedEvent {
  return {
    ...createBaseEvent('worker', organizationId), // Assuming history endpoint is worker
    event_type: 'history_requested',
    channel: channel,
    limit: limit,
    has_cursor: hasCursor,
  };
}

// --- Router Tracking Functions ---
export function trackChannelRegistered({
  organizationId,
  channel,
  routerId,
}: {
  organizationId: string;
  channel: string;
  routerId: string;
}): ChannelRegisteredEvent {
  return {
    ...createBaseEvent('do', organizationId),
    event_type: 'channel_registered',
    channel: channel,
    router_id: routerId,
  };
}

export function trackChannelUnregistered({
  organizationId,
  channel,
  routerId,
}: {
  organizationId: string;
  channel: string;
  routerId: string;
}): ChannelUnregisteredEvent {
  return {
    ...createBaseEvent('do', organizationId),
    event_type: 'channel_unregistered',
    channel: channel,
    router_id: routerId,
  };
}

// === Sending Logic ===

export async function sendEvent(
  ctx: WaitUntilContext,
  env: Env,
  logger: Logger,
  event: AnalyticsEvent,
): Promise<void> {
  ctx.waitUntil(sendEventsToTinybird(env, logger, [event]));
}

export async function sendEventBatch(
  ctx: WaitUntilContext,
  env: Env,
  logger: Logger,
  events: AnalyticsEvent[],
): Promise<void> {
  if (events.length > 0) {
    ctx.waitUntil(sendEventsToTinybird(env, logger, events));
  }
}
