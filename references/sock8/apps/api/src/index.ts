/**
 * sock8 Worker Entry Point
 *
 * A CloudFlare Worker for managing WebSocket connections and real-time message delivery.
 * This worker uses Durable Objects to manage connection state and message routing across
 * global regions.
 */
import { Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';

import { apiKey } from '@sock8/db/schema';
import { ChannelRouter } from './durable-objects/channel-router';
import { SocketShard } from './durable-objects/socket-shard';
import { apiKeyMiddleware } from './middleware/api-key';
import { errorHandler } from './middleware/error-handler';
import { registerRoutes } from './router';
import type { CustomMiddleware } from './types';
import { loadProcessEnv } from './utils/env';
import { createLoggerMiddleware, Logger, LoggerContext, LogLevel } from './utils/logger';
import { PresenceChannel } from './durable-objects/presence-channel';
import { processPersistenceQueue } from './consumers/persistence-queue-consumer';
import type { PersistenceQueueMessage } from './types';

// Load environment variables
loadProcessEnv();

/**
 * Creates a middleware that only applies to non-WebSocket routes
 * WebSocket routes require special handling to avoid interfering with the upgrade process
 */
const excludeWebSocketRoutes: CustomMiddleware = (middleware) => {
  return async (c: Context, next) => {
    // Skip middleware for WebSocket connection routes
    if (c.req.path.startsWith('/connect')) {
      return next();
    }

    // Apply the middleware to all other routes
    return middleware(c, next);
  };
};

export type HonoOptions = {
  Bindings: Env;
  Variables: {
    apiKey: typeof apiKey.$inferSelect;
  } & LoggerContext;
};

// Create the Hono application with environment binding types
const app = new Hono<HonoOptions>();

// Configure our custom logger middleware
const loggerMiddleware = createLoggerMiddleware({
  minLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  pretty: process.env.NODE_ENV !== 'production',
  context: {
    service: 'sock8-api',
    version: process.env.VERSION || 'dev',
  },
});

app.use('*', loggerMiddleware);
app.use('*', errorHandler());

// Apply global middleware with WebSocket exclusions
app.use('*', excludeWebSocketRoutes(prettyJSON()));
app.use('*', excludeWebSocketRoutes(cors()));
app.use('*', apiKeyMiddleware);

// Register API routes
registerRoutes(app);

// Global error handler as final fallback
app.use(errorHandler());

// Instantiate a logger for startup message using the Logger class
const startupLogger = new Logger({ minLevel: LogLevel.INFO }); // Instantiate directly

// Log application startup
startupLogger.info('sock8-api worker starting', {
  environment: process.env.NODE_ENV || 'development',
  version: process.env.VERSION || 'dev',
});

export type App = typeof app;

// Export app and Durable Object types for Worker runtime
export default {
  // Hono handles HTTP requests
  fetch: app.fetch,

  // Handler for the message persistence queue
  async queue(
    batch: MessageBatch<PersistenceQueueMessage>,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Create a logger instance for the queue handler using the Logger class
    // Force DEBUG level for local dev testing
    const baseQueueLogger = new Logger({ minLevel: LogLevel.DEBUG });

    // Create a logger with context for this specific batch
    const queueLogger = baseQueueLogger.withContext({
      queueName: batch.queue,
      batchId: batch.messages[0]?.id.substring(0, 8) ?? 'unknown', // Example context
    });

    // Delegate processing to the dedicated consumer function, passing the contextual logger
    await processPersistenceQueue(batch, env, queueLogger, ctx);
  },

  // Keep the existing scheduled handler if you have one
  // async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  //    // ... your scheduled task logic ...
  // },
};

// Keep DO exports
export { ChannelRouter, SocketShard, PresenceChannel };
