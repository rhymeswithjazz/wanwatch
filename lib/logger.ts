import pino from 'pino';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

// Log levels that match SystemLog table
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

// Structured metadata for logs
export interface LogMetadata {
  [key: string]: unknown;
  duration?: number;
  userId?: string;
  target?: string;
  error?: Error | string;
  statusCode?: number;
  path?: string;
}

// Initialize Pino logger
// Use basic Pino without pino-pretty to avoid worker thread issues
// Structured JSON logging works well for both development and production
const pinoLogger = pino({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  // No transport - just output JSON to stdout
  // For pretty logs in development, pipe through: npm run dev | pino-pretty
});

/**
 * Centralized logger that writes to both console (via Pino) and database (SystemLog)
 */
class Logger {
  private shouldWriteToDb(level: LogLevel): boolean {
    // Only write WARN, ERROR, and CRITICAL to database to avoid filling it up
    return ['WARN', 'ERROR', 'CRITICAL'].includes(level);
  }

  private async writeToDatabase(
    level: LogLevel,
    message: string,
    metadata?: LogMetadata
  ): Promise<void> {
    if (!this.shouldWriteToDb(level)) {
      return;
    }

    try {
      await prisma.systemLog.create({
        data: {
          level,
          message,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });
    } catch (error) {
      // If database write fails, at least log to console
      pinoLogger.error(
        { err: error, originalMessage: message },
        'Failed to write log to database'
      );
    }
  }

  /**
   * Debug level - Development diagnostics only
   */
  debug(message: string, metadata?: LogMetadata): void {
    pinoLogger.debug(metadata, message);
  }

  /**
   * Info level - General informational messages
   */
  info(message: string, metadata?: LogMetadata): void {
    pinoLogger.info(metadata, message);
    // Don't write INFO to database by default
  }

  /**
   * Warn level - Warning messages that should be investigated
   */
  async warn(message: string, metadata?: LogMetadata): Promise<void> {
    pinoLogger.warn(metadata, message);
    await this.writeToDatabase('WARN', message, metadata);
  }

  /**
   * Error level - Error conditions
   */
  async error(message: string, metadata?: LogMetadata): Promise<void> {
    pinoLogger.error(metadata, message);
    await this.writeToDatabase('ERROR', message, metadata);
  }

  /**
   * Critical level - Critical conditions requiring immediate attention
   */
  async critical(message: string, metadata?: LogMetadata): Promise<void> {
    pinoLogger.fatal(metadata, message);
    await this.writeToDatabase('CRITICAL', message, metadata);
  }

  /**
   * Log an HTTP request
   */
  async logRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    metadata?: LogMetadata
  ): Promise<void> {
    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';
    const message = `${method} ${path} ${statusCode} ${duration}ms`;

    const fullMetadata: LogMetadata = {
      method,
      path,
      statusCode,
      duration,
      ...metadata,
    };

    if (level === 'ERROR') {
      await this.error(message, fullMetadata);
    } else if (level === 'WARN') {
      await this.warn(message, fullMetadata);
    } else {
      this.info(message, fullMetadata);
    }
  }

  /**
   * Log a connectivity check result
   */
  async logConnectivityCheck(
    target: string,
    isConnected: boolean,
    latencyMs: number | null,
    metadata?: LogMetadata
  ): Promise<void> {
    if (isConnected) {
      this.debug(`Connectivity check passed: ${target} (${latencyMs}ms)`, {
        target,
        isConnected,
        latencyMs,
        ...metadata,
      });
    } else {
      await this.warn(`Connectivity check failed: ${target}`, {
        target,
        isConnected,
        latencyMs,
        ...metadata,
      });
    }
  }

  /**
   * Log an outage event
   */
  async logOutage(
    type: 'started' | 'resolved',
    outageId: string,
    duration?: number,
    metadata?: LogMetadata
  ): Promise<void> {
    const message =
      type === 'started'
        ? `Outage detected and tracked (ID: ${outageId})`
        : `Outage resolved (ID: ${outageId}, Duration: ${duration}s)`;

    const level = type === 'started' ? 'CRITICAL' : 'WARN';

    if (level === 'CRITICAL') {
      await this.critical(message, { outageId, type, duration, ...metadata });
    } else {
      await this.warn(message, { outageId, type, duration, ...metadata });
    }
  }

  /**
   * Log an email notification
   */
  async logEmail(
    type: 'success' | 'failure',
    recipient: string,
    subject: string,
    metadata?: LogMetadata
  ): Promise<void> {
    const message =
      type === 'success'
        ? `Email sent successfully to ${recipient}: ${subject}`
        : `Failed to send email to ${recipient}: ${subject}`;

    if (type === 'failure') {
      await this.error(message, { recipient, subject, ...metadata });
    } else {
      this.info(message, { recipient, subject, ...metadata });
    }
  }

  /**
   * Log authentication events
   */
  async logAuth(
    event: 'login_success' | 'login_failure' | 'logout',
    email: string,
    metadata?: LogMetadata
  ): Promise<void> {
    const messages = {
      login_success: `User logged in: ${email}`,
      login_failure: `Failed login attempt: ${email}`,
      logout: `User logged out: ${email}`,
    };

    const message = messages[event];

    if (event === 'login_failure') {
      await this.warn(message, { event, email, ...metadata });
    } else {
      this.info(message, { event, email, ...metadata });
    }
  }

  /**
   * Log application lifecycle events
   */
  async logLifecycle(
    event: 'startup' | 'shutdown' | 'config_loaded' | 'monitoring_started' | 'monitoring_stopped',
    metadata?: LogMetadata
  ): Promise<void> {
    const messages = {
      startup: 'Application starting',
      shutdown: 'Application shutting down',
      config_loaded: 'Configuration loaded successfully',
      monitoring_started: 'Monitoring system started',
      monitoring_stopped: 'Monitoring system stopped',
    };

    this.info(messages[event], { event, ...metadata });
  }

  /**
   * Log settings changes (audit trail)
   */
  async logSettings(
    action: 'target_added' | 'target_updated' | 'target_deleted' | 'target_enabled' | 'target_disabled',
    targetName: string,
    metadata?: LogMetadata
  ): Promise<void> {
    const messages = {
      target_added: `Monitoring target added: ${targetName}`,
      target_updated: `Monitoring target updated: ${targetName}`,
      target_deleted: `Monitoring target deleted: ${targetName}`,
      target_enabled: `Monitoring target enabled: ${targetName}`,
      target_disabled: `Monitoring target disabled: ${targetName}`,
    };

    const message = messages[action];
    await this.warn(message, { action, targetName, ...metadata });
  }

  /**
   * Measure and log execution time of an async function
   */
  async withTiming<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: LogMetadata
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      this.debug(`${operation} completed in ${duration}ms`, {
        operation,
        duration,
        ...metadata,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.error(`${operation} failed after ${duration}ms`, {
        operation,
        duration,
        error: error instanceof Error ? error.message : String(error),
        ...metadata,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const logger = new Logger();
