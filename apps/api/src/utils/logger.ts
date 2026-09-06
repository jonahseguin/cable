/**
 * Comprehensive logging system for [removed] Worker
 *
 * Features:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Structured logging with context
 * - Pretty formatting for development
 * - JSON format for production/analytics
 * - Request ID tracking
 * - Performance measurements
 */

import { Context, Next } from 'hono';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

// Log level colors for pretty formatting
const LOG_COLORS = {
  [LogLevel.DEBUG]: '\x1b[34m', // Blue
  [LogLevel.INFO]: '\x1b[32m', // Green
  [LogLevel.WARN]: '\x1b[33m', // Yellow
  [LogLevel.ERROR]: '\x1b[31m', // Red
  RESET: '\x1b[0m',
};

// Interface for logger options
export interface LoggerOptions {
  minLevel?: LogLevel;
  pretty?: boolean;
  context?: Record<string, any>;
}

// Interface for log entry
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  duration?: number;
  context?: Record<string, any>;
  error?: any;
}

export class Logger {
  private minLevel: LogLevel;
  private pretty: boolean;
  private baseContext: Record<string, any>;
  logs: string[] = [];

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel || LogLevel.INFO;
    this.pretty = options.pretty ?? process.env.NODE_ENV !== 'production';
    this.baseContext = options.context || {};
  }

  /**
   * Creates a child logger with additional context
   */
  withContext(context: Record<string, any>): Logger {
    const childLogger = new Logger({
      minLevel: this.minLevel,
      pretty: this.pretty,
      context: { ...this.baseContext, ...context },
    });
    return childLogger;
  }

  /**
   * Creates a logger with request ID context
   */
  withRequestId(requestId: string): Logger {
    return this.withContext({ requestId });
  }

  /**
   * Logs a message at DEBUG level
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Logs a message at INFO level
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Logs a message at WARN level
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Logs a message at ERROR level
   */
  error(message: string, error?: any, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, { ...context, error });
  }

  /**
   * Measures and logs the duration of an async function
   */
  async time<T>(
    level: LogLevel,
    message: string,
    fn: () => Promise<T>,
    context?: Record<string, any>,
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.log(level, message, { ...context, duration: Math.round(duration) });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${message} (failed)`, error, { ...context, duration: Math.round(duration) });
      throw error;
    }
  }

  /**
   * Internal method to log a message
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const entry: LogEntry = {
      timestamp,
      level,
      message,
      ...this.baseContext,
      ...(context || {}),
    };

    // Format and output the log
    if (this.pretty) {
      this.prettyPrint(entry);
    } else {
      console.log(JSON.stringify(entry));
    }

    if (process.env.NODE_ENV !== 'production') {
      this.logs.push(JSON.stringify(entry));
    }
  }

  /**
   * Determines if the given level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = Object.values(LogLevel);
    const minLevelIndex = levels.indexOf(this.minLevel);
    const currentLevelIndex = levels.indexOf(level);
    return currentLevelIndex >= minLevelIndex;
  }

  /**
   * Pretty prints a log entry
   */
  private prettyPrint(entry: LogEntry): void {
    const { timestamp, level, message, requestId, duration, context, error } = entry;

    // Format timestamp
    const timeStr = timestamp.split('T')[1].split('.')[0];

    // Format request ID
    const reqIdStr = requestId ? ` [${requestId}]` : '';

    // Format duration
    const durationStr = duration !== undefined ? ` (${duration}ms)` : '';

    // Format message with color
    const coloredLevel = `${LOG_COLORS[level]}${level}${LOG_COLORS.RESET}`;

    // Build the log message
    let logMessage = `${timeStr} ${coloredLevel}${reqIdStr}: ${message}${durationStr}`;

    // Add context if available
    const contextObj = { ...context };
    delete contextObj.requestId;
    delete contextObj.duration;

    if (Object.keys(contextObj).length > 0) {
      logMessage += `\n  Context: ${JSON.stringify(contextObj, null, 2)}`;
    }

    // Add error details if available
    if (error) {
      if (error instanceof Error) {
        logMessage += `\n  Error: ${error.message}`;
        if (error.stack) {
          logMessage += `\n  Stack: ${error.stack.split('\n').slice(1).join('\n    ')}`;
        }
      } else {
        logMessage += `\n  Error: ${JSON.stringify(error, null, 2)}`;
      }
    }

    console.log(logMessage);
  }
}

// Create and export a default logger instance
export const logger = new Logger();

// Interface for extended Hono context with logger
export interface LoggerContext {
  logger: Logger;
}

// Export a middleware generator for Hono
export const createLoggerMiddleware = (options: LoggerOptions = {}) => {
  const middlewareLogger = new Logger(options);

  return async (c: Context, next: Next) => {
    const requestId = c.req.header('x-request-id') || crypto.randomUUID();
    const reqLogger = middlewareLogger.withRequestId(requestId);

    // Add the logger to the context
    c.set('logger', reqLogger);

    // Log the request
    // reqLogger.info(`${c.req.method} ${c.req.path}`, {
    //   headers: Object.fromEntries([...c.req.raw.headers.entries()]),
    //   query: Object.fromEntries(new URL(c.req.url).searchParams),
    // });

    // Measure response time
    const start = performance.now();
    try {
      await next();
      const duration = performance.now() - start;

      // Log the response
      // reqLogger.info(`Response: ${c.res.status}`, {
      //   status: c.res.status,
      //   duration: Math.round(duration),
      // });
    } catch (error: unknown) {
      const duration = performance.now() - start;

      // Log the error
      // reqLogger.error(
      //   `Response failed: ${error instanceof Error ? error.message : String(error)}`,
      //   error,
      //   {
      //     duration: Math.round(duration),
      //   },
      // );

      throw error;
    }
  };
};
