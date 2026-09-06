/**
 * Message History Router
 *
 * Handles retrieving persisted messages for a channel with pagination.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

import type { HonoOptions } from '../index';
import { requireApiKey } from '../middleware/api-key';
import type {
  ErrorResponse,
  HistoryResponse,
  HistoryResponseMessage,
  R2MessageObject,
} from '../types';
import { LogLevel } from '../utils/logger';
import {
  sendEvent,
  trackErrorOccurred,
  trackHistoryRequested,
} from '../services/analytics-service';

// Validation schema for path and query parameters
const historyPathSchema = z.object({
  channel: z.string().min(1, 'Channel name is required'),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  cursor: z.string().optional(),
});

// Create router
export const historyRouter = new Hono<HonoOptions>();

/**
 * GET /history/:channel
 *
 * Retrieves a paginated list of persisted messages for a specific channel.
 * Requires API key authentication.
 * Supports `limit` and `cursor` query parameters for pagination.
 */
historyRouter.get(
  '/:channel',
  requireApiKey,
  zValidator('param', historyPathSchema),
  zValidator('query', historyQuerySchema),
  async (c) => {
    const apiKey = c.get('apiKey');
    const { channel } = c.req.valid('param');
    const { limit, cursor } = c.req.valid('query');
    const organizationId = apiKey.organizationId;
    const logger = c.get('logger');
    const env = c.env;
    const ctx = c.executionCtx;

    // Add explicit log for Org ID from API key - Embed value in string
    logger.info(`[History] Using Org ID from API Key: ${organizationId}`);

    // Track history request event
    const historyEvent = trackHistoryRequested({
      organizationId: organizationId,
      channel: channel,
      limit: limit,
      hasCursor: !!cursor,
    });
    sendEvent(c.executionCtx as any, env, logger, historyEvent);

    logger.info(
      `Fetching message history for channel: ${channel}, limit: ${limit}, cursor: ${cursor ? cursor.substring(0, 8) + '...' : 'none'}`,
    );

    try {
      const encodedChannelName = encodeURIComponent(channel);
      const prefix = `${organizationId}/${encodedChannelName}/`;
      logger.info(`[History] Calculated Prefix: ${prefix}`);

      // Revert listOptions back to original R2ListOptions type
      const listOptions: R2ListOptions = {
        prefix: prefix,
        limit: limit,
      };
      if (cursor) {
        listOptions.cursor = cursor;
      }

      logger.info(`[History] Listing R2 objects with options: ${JSON.stringify(listOptions)}`);

      // List objects from R2 - Revert to standard call without 'as any'
      const listed = await env.sock8_message_history.list(listOptions);

      // Embed results in string
      logger.info(
        `[History] R2 list result: ${listed.objects.length} objects. Truncated: ${listed.truncated}. Cursor: ${listed.truncated ? listed.cursor?.substring(0, 8) + '...' : 'N/A'}. Keys: [${listed.objects
          .slice(0, 3)
          .map((o) => o.key)
          .join(', ')}]`,
      );

      // Get object contents concurrently
      const getPromises = listed.objects.map(async (objMeta) => {
        try {
          const obj = await env.sock8_message_history.get(objMeta.key);
          if (!obj) {
            logger.warn(`Object listed but not found during get: ${objMeta.key}`);
            return null;
          }
          // Type assertion as R2 get returns R2ObjectBody type
          const messageData = await obj.json<R2MessageObject>();
          return {
            messageId: messageData.messageId,
            timestamp: messageData.timestamp,
            payload: messageData.payload,
          } as HistoryResponseMessage;
        } catch (err) {
          logger.error(`Failed to get or parse object: ${objMeta.key}`, err);
          return null;
        }
      });

      const settledResults = await Promise.allSettled(getPromises);

      // Filter successful results and format response
      const messages = settledResults
        .filter(
          (result): result is PromiseFulfilledResult<HistoryResponseMessage> =>
            result.status === 'fulfilled' && result.value !== null,
        )
        .map((result) => result.value);

      // Remove the sort - R2 list() with inverted timestamp keys returns newest first
      // messages.sort((a, b) => b.timestamp - a.timestamp);

      // Explicitly handle cursor based on truncated flag for TypeScript
      let nextCursor: string | undefined = undefined;
      if (listed.truncated) {
        // Use type assertion as a workaround if type narrowing fails
        nextCursor = listed.cursor;
      }

      const response: HistoryResponse = {
        messages,
        nextCursor: nextCursor,
      };

      logger.info(`Returning ${messages.length} history messages`, {
        channel,
        nextCursor: !!response.nextCursor,
      });

      return c.json(response);
    } catch (err: unknown) {
      logger.error(
        'Error fetching message history',
        err instanceof Error ? err : new Error(String(err)),
        {
          organizationId,
          channel,
        },
      );
      // Track general error - moved outside logger.error call
      const errorEvent = trackErrorOccurred({
        context: 'history_router',
        error: err instanceof Error ? err.message : String(err || 'Unknown error'),
        organizationId: organizationId,
        details: { channel },
      });
      sendEvent(c.executionCtx as any, env, logger, errorEvent);
      // Re-throw or return the error response
      return c.json<ErrorResponse>(
        { error: 'Internal server error fetching history' },
        500 as ContentfulStatusCode,
      );
    }
  },
);
