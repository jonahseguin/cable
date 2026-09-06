/**
 * WebSocket Connection Handler
 *
 * Manages incoming WebSocket connections, validates tokens, and routes connections
 * to appropriate shards based on region and load balancing.
 */
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { HonoOptions } from '../index';
import {
  determineTargetShard,
  prepareShardConnection,
  validateConnection,
} from '../services/connection-service';
import type { ErrorResponse } from '../types';
import { LogLevel } from '../utils/logger';
import { mapColoToRegion } from '../utils/region';
import { nanoid } from 'nanoid';
import {
  sendEvent,
  trackConnectionEstablished,
  trackConnectionFailedValidation,
  trackErrorOccurred,
} from '../services/analytics-service';
import { ExecutionContext } from 'hono';
import type { Context } from 'hono';

// Create router with extended context for logger
export const connectRouter = new Hono<HonoOptions>();

/**
 * WebSocket connection endpoint
 *
 * Handles:
 * 1. Validating connection tokens
 * 2. Determining optimal shard placement
 * 3. Upgrading HTTP to WebSocket connections
 * 4. Routing connections to appropriate Durable Object shards
 */
connectRouter.get(
  '/:token',
  zValidator('param', z.object({ token: z.string().min(1).max(2048) })),
  async (c) => {
    const logger = c.get('logger');
    const env = c.env;

    try {
      const token = c.req.valid('param').token;
      const upgradeHeader = c.req.header('Upgrade');

      console.log('Processing WebSocket connection request', {
        token: token.slice(0, 8) + '...',
        upgrade: upgradeHeader,
      });

      // Validate WebSocket connection and token
      const validationResult = await logger.time(
        LogLevel.DEBUG,
        'Connection validation completed',
        () => validateConnection(upgradeHeader, token),
      );

      if (!validationResult.success) {
        // Track validation failure
        const event = trackConnectionFailedValidation({
          reason: validationResult.error,
          tokenPrefix: token.slice(0, 8),
        });
        sendEvent(c.executionCtx as any, env, logger, event);

        console.log('Connection validation failed', {
          error: validationResult.error,
          status: validationResult.status,
        });
        return c.json<ErrorResponse>(
          { error: validationResult.error },
          validationResult.status as ContentfulStatusCode,
        );
      }

      const { connection } = validationResult;

      logger.debug('Connection validated', {
        connectionId: connection.identifier,
        organizationId: connection.entity,
        channelCount: connection.authorizedChannels.length,
      });

      // Determine user's geographic region from Cloudflare colo
      const colo = c.req.raw.cf?.colo as string | undefined;
      const region = mapColoToRegion(colo);

      logger.debug('Region determined', { colo: colo ?? 'undefined', region: region });

      // Determine optimal shard for this connection based on channels and load
      const { shardName } = await logger.time(
        LogLevel.DEBUG,
        'Shard targeting completed',
        () =>
          determineTargetShard(
            c.env,
            {
              identity: connection.identifier,
              organizationId: connection.entity,
              channels: connection.authorizedChannels,
            },
            region,
            c.executionCtx as any,
          ),
        { connectionId: connection.identifier, region },
      );

      // Prepare the connection with the selected shard
      const { shard } = await logger.time(
        LogLevel.DEBUG,
        'Shard connection preparation completed',
        () =>
          prepareShardConnection(
            c.env,
            {
              identity: connection.identifier,
              organizationId: connection.entity,
              channels: connection.authorizedChannels,
            },
            region,
            shardName,
            c.executionCtx as any,
          ),
        { connectionId: connection.identifier, shardName },
      );

      // Pass connection metadata via headers for the shard to process
      const headers = new Headers(c.req.raw.headers);
      headers.set('x-socket-id', nanoid());
      headers.set('x-identity', connection.identifier);
      const socketId = headers.get('x-socket-id')!;
      const orgId = connection.entity;
      const shardId = shardName.split(':').pop() ?? 'unknown';
      headers.set('x-organization-id', connection.entity);
      headers.set('x-region', region);
      headers.set('x-shard-id', shardId);
      headers.set('x-channels', JSON.stringify(connection.authorizedChannels));

      // Track connection established before logging info
      const establishedEvent = trackConnectionEstablished({
        organizationId: orgId,
        socketId: socketId,
        region: region,
        shardId: shardId,
        identity: connection.identifier,
      });
      sendEvent(c.executionCtx as any, env, logger, establishedEvent);

      logger.info('WebSocket connection established', {
        connectionId: connection.identifier,
        organizationId: connection.entity,
        region,
        shardName,
        channelCount: connection.authorizedChannels.length,
      });

      // Forward to shard for WebSocket handling
      return shard.fetch(new Request(c.req.raw, { headers }));
    } catch (err) {
      logger.error('Connection error', err || new Error('Unknown error occurred'));

      // Track general error
      const errorEvent = trackErrorOccurred({
        context: 'connect_router',
        error: err instanceof Error ? err.message : String(err || 'Unknown error'),
        organizationId: undefined,
      });
      sendEvent(c.executionCtx as any, c.env, c.get('logger'), errorEvent);

      return c.json<ErrorResponse>(
        { error: 'Internal server error processing connection' },
        500 as ContentfulStatusCode,
      );
    }
  },
);
