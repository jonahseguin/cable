/**
 * Global type definitions for the sock8 worker
 */
import { Context, MiddlewareHandler, Next } from 'hono';

// Custom middleware factory type
export type CustomMiddleware = (
  middleware: MiddlewareHandler,
) => (c: Context, next: Next) => Promise<Response | void>;

// Socket connection information
export interface SocketConnection {
  identity: string;
  organizationId: string;
  channels: string[];
}

// Channel registration request
export interface ChannelRegistration {
  channel: string;
  shardId: string;
}

// Channel lookup request
export interface ChannelLookup {
  channel: string;
}

// Shard connection count request
export interface ShardConnections {
  shardId: string;
}

// Shard assignment request
export interface ShardAssignment {
  channel: string;
  connectionId: string;
}

// Publish payload
export interface PublishPayload {
  account: string;
  channel: string;
  payload: string;
}

// Message delivery payload
export interface ChannelMessage {
  channel: string;
  payload: string;
}

// Welcome message
export interface WelcomeMessage {
  event: 'welcome';
  // organizationId: string;
  region: string;
  socketId: string;
  channels: string[];
}

// Outgoing channel message
export interface OutgoingChannelMessage {
  channel: string;
  payload: string;
  region: string;
}

// Response for publish endpoint
export interface PublishResponse {
  ok: boolean;
  publishedTo: Record<string, string[]>;
}

// Error response
export interface ErrorResponse {
  error: string;
}

// --- Presence Types ---

/**
 * Structure stored in PresenceChannel DO for each socket.
 */
export interface PresenceEntry {
  identity: string; // User identifier associated with the socket
  isConnected: boolean;
  data: unknown; // User-defined presence payload
  lastSeen: number; // Timestamp
}

/**
 * Payload from SocketShard to PresenceChannel to update an entry.
 */
export interface UpdatePresencePayload {
  socketId: string; // Retained for potential tracing/logging
  identity: string;
  entry: PresenceValue; // The actual data { isConnected, data, lastSeen }
  organizationId: string; // Added for context
  channelName: string; // Added for context
}

/**
 * Payload sent from SocketShard to PresenceChannel DO for removal.
 */
export interface RemovePresencePayload {
  socketId: string;
}

// --- WebSocket Message Types for Presence ---

/**
 * Base interface for presence-related WebSocket messages.
 */
interface PresenceBaseMessage {
  event: string;
  channel: string;
}

/**
 * Client -> Server: Update presence data for a channel.
 */
export interface SetPresenceMessage extends PresenceBaseMessage {
  event: 'setPresence';
  data: unknown;
}

/**
 * Client -> Server: Request the full presence state for a channel.
 */
export interface GetPresenceMessage extends PresenceBaseMessage {
  event: 'getPresence';
}

/**
 * Server -> Client: Full presence state for a channel.
 */
export interface PresenceStateMessage extends PresenceBaseMessage {
  event: 'presenceState';
  // Key is identity, value is PresenceValue
  state: Record<string, PresenceValue>;
}

/**
 * Server -> Client: Incremental presence updates.
 */
export interface PresenceUpdateMessage extends PresenceBaseMessage {
  event: 'presenceUpdate';
  // Key is identity, value is PresenceValue
  updates: Record<string, PresenceValue>;
  removals: string[]; // List of identities that were removed
}

/**
 * Union type for all possible incoming WebSocket messages from client related to presence.
 */
export type ClientPresenceMessage = SetPresenceMessage | GetPresenceMessage;

/**
 * Union type for all possible outgoing WebSocket messages to client related to presence.
 */
export type ServerPresenceMessage = PresenceStateMessage | PresenceUpdateMessage;

// --- Durable Object Method Interfaces ---

// Define value type stored in PresenceChannel Map
export type PresenceValue = Omit<PresenceEntry, 'identity'>;

// Methods exposed by PresenceChannel DO
export interface PresenceChannelMethods {
  updatePresenceEntry(payload: UpdatePresencePayload): Promise<void>;
  getState(): Promise<Record<string, PresenceValue>>;
}

// Methods exposed by ChannelRouter DO (including upcoming presence method)
export interface ChannelRouterMethods {
  // Presence
  publishPresenceUpdate(payload: {
    channel: string;
    socketId: string;
    presenceEntry: PresenceEntry;
    originatingShardId: string;
  }): Promise<void>;

  // Existing
  register(payload: ChannelRegistration): Promise<void>;
  unregister(payload: ChannelRegistration): Promise<void>;
  lookup(payload: ChannelLookup): Promise<string[]>;
  assignShard(payload: ShardAssignment): Promise<string | null>;
  incrementShardConnections(payload: ShardConnections): Promise<void>;
  decrementShardConnections(payload: ShardConnections): Promise<void>;
  getShardConnections(payload: ShardConnections): Promise<number>;
  listShards(): Promise<string[]>;
  listChannels(): Promise<string[]>;
  unregisterAll(payload: ShardConnections): Promise<void>; // Assuming this exists based on prior context
}

// Methods exposed by SocketShard DO (for inter-shard communication if needed)
export interface SocketShardMethods {
  publishToChannel(message: ChannelMessage): Promise<void>;
  receivePresenceUpdate(payload: {
    channel: string;
    socketId: string;
    presenceEntry: PresenceEntry;
    originatingShardId: string;
  }): Promise<void>;
}

/** Request body for the /publish endpoint - REVERTED */
export interface PublishRequestBody {
  channel: string;
  payload: string;
  // Reverted back to optional boolean flag
  persist?: boolean;
}

/** Type for the message sent to the persistence queue - REVERTED */
export interface PersistenceQueueMessage {
  organizationId: string;
  channel: string;
  timestamp: number; // Milliseconds epoch UTC
  messageId: string; // Unique ID for this specific message instance
  payload: string; // The original message payload
}

/** Structure of the message object stored in R2 */
export interface R2MessageObject {
  messageId: string;
  channel: string;
  timestamp: number;
  payload: string;
}

/** A single message within the history response */
export interface HistoryResponseMessage {
  messageId: string;
  timestamp: number;
  payload: string; // Or potentially the parsed payload if it's always JSON
}

/** Response from the /history API endpoint */
export interface HistoryResponse {
  messages: HistoryResponseMessage[];
  nextCursor?: string; // For pagination
}
