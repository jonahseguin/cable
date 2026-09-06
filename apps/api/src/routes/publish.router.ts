/**
 * Message Publishing Router
 *
 * Handles publishing messages to WebSocket channels across the global infrastructure.
 * Uses a fanning-out mechanism to distribute messages to all connected clients.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { nanoid } from 'nanoid';

import type { HonoOptions } from '../index'; // HonoOptions should implicitly bring Env via { Bindings: Env }
import {
  sendEvent,
  trackErrorOccurred,
  trackMessagePublishedApi,
  trackMessageQueuedPersistence,
} from '../services/analytics-service'; // Import analytics functions
import { requireApiKey } from '../middleware/api-key';
import { publishToChannel } from '../services/publish-service';
import { type ErrorResponse, type PublishResponse, type PersistenceQueueMessage } from '../types';
import { LogLevel } from '../utils/logger';

// Request validation schema for publish endpoint
const publishSchema = z.object({
  channel: z.string().min(1, 'Channel name is required'),
  payload: z.string().min(1, 'Message payload cannot be empty'),
  persist: z.boolean().optional().default(false),
});

// Env should be inferred from HonoOptions generic
export const publishRouter = new Hono<HonoOptions>();

/**
 * Publish message endpoint
 *
 * Validates the publish request and distributes messages to all connected clients
 * across regions and shards.
 *
 * Returns:
 * - Success response with shard distribution map
 * - Error response with appropriate status code for rate limiting or server errors
 */
publishRouter.post('/', requireApiKey, zValidator('json', publishSchema), async (c) => {
  const apiKey = c.get('apiKey');
  // Type assertion for validated data
  const validatedData = c.req.valid('json') as {
    channel: string;
    payload: string;
    persist?: boolean; // Use boolean type
  };
  const { channel, payload, persist } = validatedData; // Use persist boolean
  const payloadSize = payload.length;

  const organizationId = apiKey.organizationId;
  const logger = c.get('logger');
  const env = c.env; // Env should be typed via Hono generic
  const ctx = c.executionCtx;

  logger.info('Publishing message', {
    organizationId,
    channel,
    payloadSize,
    persist,
  });

  // Track the API publish event
  const publishEvent = trackMessagePublishedApi({
    organizationId: organizationId,
    channel: channel,
    payloadSize: payloadSize,
    persist: persist ?? false,
  });
  sendEvent(c.executionCtx as any, env, logger, publishEvent);

  try {
    // --- Logging: Before calling publishToChannel service ---
    logger.debug('Attempting to call publishToChannel service', { organizationId, channel });

    const result = await publishToChannel(
      env,
      organizationId,
      channel,
      payload,
      c.executionCtx as any,
    );

    // --- Logging: After calling publishToChannel service ---
    logger.debug('Returned from publishToChannel service call', {
      success: result?.success,
      error: result?.error,
      status: result?.status,
    });

    console.log(result.shardMap);

    // Handle persistence if flag is true and publish was successful
    if (persist && result.success) {
      // Check boolean flag
      try {
        const timestamp = Date.now();
        const messageId = nanoid();

        // Remove persistenceOption from queue message
        const queueMessage: PersistenceQueueMessage = {
          organizationId,
          channel,
          timestamp,
          messageId,
          payload,
        };

        // Log components before enqueueing - Embed values in string
        logger.debug(`[Publish] Enqueuing for: orgId=${organizationId}, channel=${channel}`);

        // Track queueing for persistence
        const queueEvent = trackMessageQueuedPersistence({
          organizationId: organizationId,
          channel: channel,
          messageId: messageId,
        });
        // Send this event immediately within the waitUntil context
        sendEvent(c.executionCtx as any, env, logger, queueEvent);

        // Ensure message_persistence_queue is part of Env type
        const queue = env.message_persistence_queue;

        if (!queue) {
          logger.error('MESSAGE_PERSISTENCE_QUEUE binding missing in environment');
          // Potentially return an error response to the client here
          // return c.json({ error: 'Persistence setup error' }, 500);
        } else {
          // Send to queue - use waitUntil for fire-and-forget reliability
          ctx.waitUntil(
            queue
              .send(queueMessage)
              .then(() => {
                logger.debug('Message enqueued for persistence', {
                  organizationId,
                  channel,
                  messageId,
                });
              })
              .catch((err: Error) => {
                logger.error('Failed to enqueue message for persistence', err, {
                  organizationId,
                  channel,
                });
                // Optional: Add monitoring/alerting here
              }),
          );
        }
      } catch (queueError: unknown) {
        logger.error(
          'Synchronous error while trying to enqueue message',
          queueError instanceof Error ? queueError : new Error(String(queueError)),
          {
            organizationId,
            channel,
          },
        );
      }
    }

    if (!result.success) {
      const status = result.status === 429 ? 429 : 500;
      // --- Logging: publishToChannel service reported failure ---
      logger.warn('publishToChannel service returned !result.success', {
        organizationId,
        channel,
        error: result.error,
        status,
      });
      // Track general error
      const errorEvent = trackErrorOccurred({
        context: 'publish_router_failure',
        error: String(result.error || 'Unknown publish failure'),
        organizationId: organizationId,
        details: { channel },
      });
      sendEvent(c.executionCtx as any, env, logger, errorEvent);
      return c.json<ErrorResponse>(
        { error: result.error || 'Failed to publish message' },
        status as ContentfulStatusCode,
      );
    }

    // Return successful publish with shard distribution map
    logger.info('Message published successfully', {
      organizationId,
      channel,
      shardCount: Object.keys(result.shardMap || {}).length,
    });

    return c.json<PublishResponse>({
      ok: true,
      publishedTo: result.shardMap || {},
    });
  } catch (err: unknown) {
    // --- Logging: Error caught in publish router handler ---
    logger.error(
      'Error caught directly in publish router handler try/catch block',
      err instanceof Error ? err : new Error(String(err || 'Unknown error occurred')),
      {
        organizationId,
        channel,
      },
    );
    // Track general error
    const errorEvent = trackErrorOccurred({
      context: 'publish_router',
      error: err instanceof Error ? err.message : String(err || 'Unknown error'),
      organizationId: organizationId,
      details: { channel },
    });
    sendEvent(c.executionCtx as any, env, logger, errorEvent);
    return c.json<ErrorResponse>(
      { error: 'Internal server error in publish service' },
      500 as ContentfulStatusCode,
    );
  }
});
