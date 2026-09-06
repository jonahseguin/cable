/**
 * Error Handling Middleware
 *
 * Provides standardized error handling and logging for all routes.
 * Intercepts exceptions and transforms them into consistent API responses.
 */
import { MiddlewareHandler } from 'hono';
import type { ErrorResponse } from '../types';

/**
 * HTTP error status codes supported by the API
 */
type ApiErrorStatusCode = 400 | 401 | 403 | 404 | 405 | 409 | 429 | 500 | 503;

/**
 * Extended error with status code
 */
interface StatusError extends Error {
  status?: number;
}

/**
 * Global error handler middleware
 *
 * Features:
 * - Catches all uncaught errors in the request lifecycle
 * - Standardizes error response format
 * - Logs errors with appropriate context
 * - Validates status codes for consistency
 *
 * @returns Hono middleware handler
 */
export const errorHandler = (): MiddlewareHandler => {
  return async (c, next) => {
    // Skip error handling for WebSocket upgrade requests
    // These need special handling for the upgrade flow
    if (c.req.header('Upgrade')?.toLowerCase() === 'websocket') {
      return await next();
    }

    try {
      await next();
    } catch (error) {
      // Log error with context for debugging
      const path = c.req.path;
      const method = c.req.method;
      console.error(`[ErrorHandler] ${method} ${path}:`, error);

      // Determine appropriate status code
      let status: ApiErrorStatusCode = 500;

      if (error instanceof Error && 'status' in error) {
        const errorStatus = Number((error as StatusError).status);

        // Ensure status is a valid API error code
        const validCodes: ApiErrorStatusCode[] = [400, 401, 403, 404, 405, 409, 429, 500, 503];
        if (validCodes.includes(errorStatus as ApiErrorStatusCode)) {
          status = errorStatus as ApiErrorStatusCode;
        }
      }

      // Create standardized error response
      const response: ErrorResponse = {
        error: error instanceof Error ? error.message : 'Internal server error',
      };

      return c.json(response, status);
    }
  };
};
