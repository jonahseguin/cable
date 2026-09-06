/* eslint-disable turbo/no-undeclared-env-vars */
/**
 * Environment Configuration
 *
 * Manages environment variables and configuration settings for the application.
 * Provides compatibility between Cloudflare Workers and traditional Node.js environments.
 */
import { env } from 'cloudflare:workers';

/**
 * Default configuration values
 * These are used when environment variables are not provided
 */
const defaults = {
  // Database configuration
  database: {
    host: '',
    username: '',
    password: '',
    name: '',
    url: '',
  },

  // Application environment
  nodeEnv: 'development',

  // Connection limits
  maxConnectionsPerShard: '1000',
  highLoadThreshold: '0.8',
  mediumLoadThreshold: '0.5',

  // Region configuration
  activeRegionTtlSeconds: (60 * 15).toString(), // 15 minutes
  defaultRegion: 'unknown',
  globalRegion: 'global',

  // Token expiration
  tokenTtlMilliseconds: (1000 * 60 * 5).toString(), // 5 minutes

  // KV namespace prefixes
  kvPrefixes: {
    socket: 'socket:',
    activeRegion: 'active-region:',
  },

  // Consistent hashing configuration
  virtualNodesCount: '100',

  // Cache TTLs (in milliseconds)
  cacheTtl: {
    region: '15000', // 15 seconds
    channel: '15000', // 15 seconds
  },

  // Rate limiting
  rateLimit: {
    publish: {
      max: '100',
      window: '60', // seconds
    },
    connect: {
      max: '50',
      window: '60', // seconds
    },
  },
};

/**
 * Loads Cloudflare environment variables into process.env for compatibility
 *
 * This allows using traditional Node.js environment variable access patterns
 * within a Cloudflare Workers environment. It applies sensible defaults
 * when specific variables are not provided.
 */
export function loadProcessEnv(): void {
  // Database environment variables
  process.env.DATABASE_HOST = env.DATABASE_HOST || defaults.database.host;
  process.env.DATABASE_USERNAME = env.DATABASE_USERNAME || defaults.database.username;
  process.env.DATABASE_PASSWORD = env.DATABASE_PASSWORD || defaults.database.password;
  process.env.DATABASE_NAME = env.DATABASE_NAME || defaults.database.name;
  process.env.DATABASE_URL = env.DATABASE_URL || defaults.database.url;

  // Environment
  process.env.NODE_ENV = env.NODE_ENV || process.env.NODE_ENV || defaults.nodeEnv;

  // Connection limits
  process.env.MAX_CONNECTIONS_PER_SHARD =
    env.MAX_CONNECTIONS_PER_SHARD || defaults.maxConnectionsPerShard;
  process.env.HIGH_LOAD_THRESHOLD = env.HIGH_LOAD_THRESHOLD || defaults.highLoadThreshold;
  process.env.MEDIUM_LOAD_THRESHOLD = env.MEDIUM_LOAD_THRESHOLD || defaults.mediumLoadThreshold;

  // Region configuration
  process.env.ACTIVE_REGION_TTL_SECONDS =
    env.ACTIVE_REGION_TTL_SECONDS || defaults.activeRegionTtlSeconds;
  process.env.DEFAULT_REGION = env.DEFAULT_REGION || defaults.defaultRegion;
  process.env.GLOBAL_REGION = env.GLOBAL_REGION || defaults.globalRegion;

  // Token TTL
  process.env.TOKEN_TTL_MILLISECONDS = env.TOKEN_TTL_MILLISECONDS || defaults.tokenTtlMilliseconds;

  // KV namespace prefixes
  process.env.KV_PREFIX_SOCKET = env.KV_PREFIX_SOCKET || defaults.kvPrefixes.socket;
  process.env.KV_PREFIX_ACTIVE_REGION =
    env.KV_PREFIX_ACTIVE_REGION || defaults.kvPrefixes.activeRegion;

  // Consistent hashing
  process.env.VIRTUAL_NODES_COUNT = env.VIRTUAL_NODES_COUNT || defaults.virtualNodesCount;

  // Cache TTLs
  process.env.CACHE_TTL_REGION = env.CACHE_TTL_REGION || defaults.cacheTtl.region;
  process.env.CACHE_TTL_CHANNEL = env.CACHE_TTL_CHANNEL || defaults.cacheTtl.channel;

  // Rate limiting
  process.env.RATE_LIMIT_PUBLISH_MAX = env.RATE_LIMIT_PUBLISH_MAX || defaults.rateLimit.publish.max;
  process.env.RATE_LIMIT_PUBLISH_WINDOW =
    env.RATE_LIMIT_PUBLISH_WINDOW || defaults.rateLimit.publish.window;
  process.env.RATE_LIMIT_CONNECT_MAX = env.RATE_LIMIT_CONNECT_MAX || defaults.rateLimit.connect.max;
  process.env.RATE_LIMIT_CONNECT_WINDOW =
    env.RATE_LIMIT_CONNECT_WINDOW || defaults.rateLimit.connect.window;
}
