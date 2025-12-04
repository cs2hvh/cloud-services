/**
 * Standardized Error Handling Utilities
 * 
 * This module provides consistent error handling patterns across the application.
 * Use these utilities instead of console.log/error for production-ready error handling.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  module: string;
  operation?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Structured logger for server-side operations
 * In production, this could be replaced with a proper logging service (e.g., Winston, Pino)
 */
class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private formatMessage(level: LogLevel, message: string, context?: LogContext, error?: unknown): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` [${context.module}${context.operation ? `::${context.operation}` : ''}]` : '';
    const errorStr = error instanceof Error ? ` - ${error.message}` : error ? ` - ${String(error)}` : '';
    
    return `${timestamp} ${level.toUpperCase()}${contextStr}: ${message}${errorStr}`;
  }

  /**
   * Log info messages (development only)
   */
  info(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  /**
   * Log warning messages
   */
  warn(message: string, context?: LogContext, error?: unknown): void {
    console.warn(this.formatMessage('warn', message, context, error));
  }

  /**
   * Log error messages with optional error object
   */
  error(message: string, context?: LogContext, error?: unknown): void {
    console.error(this.formatMessage('error', message, context, error));
  }

  /**
   * Log debug messages (development only)
   */
  debug(message: string, context?: LogContext, metadata?: Record<string, unknown>): void {
    if (this.isDevelopment && metadata) {
      console.debug(this.formatMessage('debug', message, context), metadata);
    } else if (this.isDevelopment) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }
}

export const logger = new Logger();

/**
 * Standard error response format for API routes
 */
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode?: number;
  details?: unknown;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: string,
  message: string,
  statusCode: number = 500,
  details?: unknown
): ErrorResponse {
  return {
    error,
    message,
    statusCode,
    ...(details && process.env.NODE_ENV === 'development' ? { details } : {}),
  };
}

/**
 * Handle database query errors consistently
 */
export function handleQueryError(
  operation: string,
  error: unknown,
  module: string = 'Database'
): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`${operation} failed`, { module, operation }, error);
}

/**
 * Handle API route errors consistently
 */
export function handleAPIError(
  operation: string,
  error: unknown,
  route: string
): ErrorResponse {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  logger.error(`API Error in ${route}`, { module: 'API', operation: route }, error);
  
  return createErrorResponse(
    'Request processing failed',
    message,
    500,
    process.env.NODE_ENV === 'development' ? error : undefined
  );
}

/**
 * Safe error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}
