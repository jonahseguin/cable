/**
 * sock8 System Constants
 *
 * Central location for configuration constants used throughout the application.
 * Grouping related constants for better organization and maintainability.
 */

/**
 * Durable Object Naming Prefixes
 */
export const DO_PREFIX = {
  PRESENCE_CHANNEL: 'presence',
  CHANNEL_ROUTER: 'router',
  SOCKET_SHARD: 'shard',
};

/**
 * Shard Capacity Configuration
 * Controls connection distribution and load balancing
 */
export const MAX_CONNECTIONS_PER_SHARD = 1000;

// Load thresholds for shard selection (percentage of capacity)
export const HIGH_LOAD_THRESHOLD = 0.8; // 80% capacity - avoid new connections if possible
export const MEDIUM_LOAD_THRESHOLD = 0.5; // 50% capacity - prefer less loaded shards

/**
 * Region Configuration
 * Settings for region detection and management
 */
// Time a region stays marked as active after last connection
export const ACTIVE_REGION_TTL_SECONDS = 60 * 15; // 15 minutes

// Default regions
export const DEFAULT_REGION = 'unknown'; // Used when region can't be determined
export const GLOBAL_REGION = 'global'; // Used for global resources

/**
 * Token Management
 * Settings for connection token handling
 */
// Time a token remains valid after disconnection
export const TOKEN_TTL_MILLISECONDS = 1000 * 60 * 5; // 5 minutes

/**
 * Storage Configuration
 * Settings for data storage and caching
 */
// KV namespace prefixes for different data types
export const KV_PREFIXES = {
  SOCKET: 'socket:',
  ACTIVE_REGION: 'active-region:',
};

// In-memory cache TTLs
export const CACHE_TTL = {
  REGION: 15_000, // 15 seconds - active regions cache
  CHANNEL: 15_000, // 15 seconds - channel shard mapping cache
};

/**
 * Algorithm Configuration
 * Settings for internal algorithms
 */
// Number of virtual nodes per real node in consistent hashing
export const DEFAULT_VIRTUAL_NODES = 100;

/**
 * Presence Configuration
 */
// How long to keep presence data for disconnected users (milliseconds)
export const PRESENCE_TTL_MS = parseInt(process.env.PRESENCE_TTL_MILLISECONDS || '300000'); // 5 minutes default

// How often the PresenceChannel DO runs its cleanup alarm (milliseconds)
export const PRESENCE_CLEANUP_INTERVAL_MS = parseInt(
  process.env.PRESENCE_CLEANUP_INTERVAL_MILLISECONDS || '60000',
); // 1 minute default

/** Interval (in ms) between sending throttled 'setPresence' updates */
export const PRESENCE_THROTTLE_INTERVAL_MS = 16; // Aiming for ~60Hz (1000ms / 16ms ≈ 62.5Hz)

/** Short debounce delay (in ms) to batch rapid partial 'setPresence' updates into a frame */
export const PRESENCE_DEBOUNCE_FRAME_MS = 10; // Example: 10ms debounce window
