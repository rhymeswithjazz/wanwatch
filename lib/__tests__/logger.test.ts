/**
 * Tests for Logger
 *
 * Tests the hybrid console/database logging system including:
 * - Log level filtering for database writes
 * - Specialized log methods
 * - Error handling for database failures
 * - Performance timing
 */

// Mock functions - declare as let so they can be accessed by tests
let mockPinoDebug: jest.Mock;
let mockPinoInfo: jest.Mock;
let mockPinoWarn: jest.Mock;
let mockPinoError: jest.Mock;
let mockPinoFatal: jest.Mock;
let mockSystemLogCreate: jest.Mock;

// Mock pino - factory function runs at mock time
jest.mock('pino', () => {
  const debug = jest.fn();
  const info = jest.fn();
  const warn = jest.fn();
  const error = jest.fn();
  const fatal = jest.fn();

  // Store references for test access
  (global as Record<string, unknown>).__mockPinoDebug = debug;
  (global as Record<string, unknown>).__mockPinoInfo = info;
  (global as Record<string, unknown>).__mockPinoWarn = warn;
  (global as Record<string, unknown>).__mockPinoError = error;
  (global as Record<string, unknown>).__mockPinoFatal = fatal;

  return jest.fn(() => ({
    debug,
    info,
    warn,
    error,
    fatal,
  }));
});

// Mock prisma
jest.mock('@/lib/db', () => {
  const create = jest.fn();
  (global as Record<string, unknown>).__mockSystemLogCreate = create;
  return {
    prisma: {
      systemLog: {
        create,
      },
    },
  };
});

// Mock env - use global for access across hoisting boundary
jest.mock('@/lib/env', () => {
  const envStore: Record<string, string> = { NODE_ENV: 'test' };
  (global as Record<string, unknown>).__mockEnv = envStore;
  return {
    env: new Proxy({} as Record<string, string>, {
      get: (_target, prop: string) => envStore[prop],
    }),
  };
});

// Import after mocks are set up
import { logger } from '../logger';

// Get mock references after import
beforeAll(() => {
  mockPinoDebug = (global as Record<string, unknown>).__mockPinoDebug as jest.Mock;
  mockPinoInfo = (global as Record<string, unknown>).__mockPinoInfo as jest.Mock;
  mockPinoWarn = (global as Record<string, unknown>).__mockPinoWarn as jest.Mock;
  mockPinoError = (global as Record<string, unknown>).__mockPinoError as jest.Mock;
  mockPinoFatal = (global as Record<string, unknown>).__mockPinoFatal as jest.Mock;
  mockSystemLogCreate = (global as Record<string, unknown>).__mockSystemLogCreate as jest.Mock;
});

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const mockEnv = (global as Record<string, unknown>).__mockEnv as Record<string, string>;
    mockEnv.NODE_ENV = 'test';
    mockSystemLogCreate.mockResolvedValue({ id: 'test-log-id' });
  });

  describe('log levels and database writes', () => {
    describe('debug', () => {
      it('should log to console via pino', () => {
        logger.debug('Debug message', { key: 'value' });

        expect(mockPinoDebug).toHaveBeenCalledWith(
          { key: 'value' },
          'Debug message'
        );
      });

      it('should NOT write to database', () => {
        logger.debug('Debug message');

        expect(mockSystemLogCreate).not.toHaveBeenCalled();
      });
    });

    describe('info', () => {
      it('should log to console via pino', () => {
        logger.info('Info message', { key: 'value' });

        expect(mockPinoInfo).toHaveBeenCalledWith(
          { key: 'value' },
          'Info message'
        );
      });

      it('should NOT write to database', () => {
        logger.info('Info message');

        expect(mockSystemLogCreate).not.toHaveBeenCalled();
      });
    });

    describe('warn', () => {
      it('should log to console via pino', async () => {
        await logger.warn('Warning message', { key: 'value' });

        expect(mockPinoWarn).toHaveBeenCalledWith(
          { key: 'value' },
          'Warning message'
        );
      });

      it('should write to database', async () => {
        await logger.warn('Warning message', { key: 'value' });

        expect(mockSystemLogCreate).toHaveBeenCalledWith({
          data: {
            level: 'WARN',
            message: 'Warning message',
            metadata: JSON.stringify({ key: 'value' }),
          },
        });
      });

      it('should handle missing metadata', async () => {
        await logger.warn('Warning message');

        expect(mockSystemLogCreate).toHaveBeenCalledWith({
          data: {
            level: 'WARN',
            message: 'Warning message',
            metadata: null,
          },
        });
      });
    });

    describe('error', () => {
      it('should log to console via pino', async () => {
        await logger.error('Error message', { error: 'details' });

        expect(mockPinoError).toHaveBeenCalledWith(
          { error: 'details' },
          'Error message'
        );
      });

      it('should write to database', async () => {
        await logger.error('Error message', { error: 'details' });

        expect(mockSystemLogCreate).toHaveBeenCalledWith({
          data: {
            level: 'ERROR',
            message: 'Error message',
            metadata: JSON.stringify({ error: 'details' }),
          },
        });
      });
    });

    describe('critical', () => {
      it('should log to console via pino fatal', async () => {
        await logger.critical('Critical message');

        expect(mockPinoFatal).toHaveBeenCalledWith(undefined, 'Critical message');
      });

      it('should write to database', async () => {
        await logger.critical('Critical message');

        expect(mockSystemLogCreate).toHaveBeenCalledWith({
          data: {
            level: 'CRITICAL',
            message: 'Critical message',
            metadata: null,
          },
        });
      });
    });
  });

  describe('database write error handling', () => {
    it('should log to pino if database write fails', async () => {
      mockSystemLogCreate.mockRejectedValue(new Error('Database error'));

      await logger.error('Error message');

      expect(mockPinoError).toHaveBeenCalledTimes(2);
      expect(mockPinoError).toHaveBeenLastCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          originalMessage: 'Error message',
        }),
        'Failed to write log to database'
      );
    });

    it('should not throw when database write fails', async () => {
      mockSystemLogCreate.mockRejectedValue(new Error('Database error'));

      await expect(logger.warn('Warning message')).resolves.not.toThrow();
    });
  });

  describe('logRequest', () => {
    it('should log successful request as INFO (not to DB)', async () => {
      await logger.logRequest('GET', '/api/stats', 200, 45);

      expect(mockPinoInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/api/stats',
          statusCode: 200,
          duration: 45,
        }),
        'GET /api/stats 200 45ms'
      );
      expect(mockSystemLogCreate).not.toHaveBeenCalled();
    });

    it('should log 4xx request as WARN (to DB)', async () => {
      await logger.logRequest('POST', '/api/login', 401, 15);

      expect(mockPinoWarn).toHaveBeenCalled();
      expect(mockSystemLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          level: 'WARN',
          message: 'POST /api/login 401 15ms',
        }),
      });
    });

    it('should log 5xx request as ERROR (to DB)', async () => {
      await logger.logRequest('GET', '/api/data', 500, 100);

      expect(mockPinoError).toHaveBeenCalled();
      expect(mockSystemLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          level: 'ERROR',
          message: 'GET /api/data 500 100ms',
        }),
      });
    });

    it('should include additional metadata', async () => {
      await logger.logRequest('GET', '/api/stats', 200, 45, { userId: 'user123' });

      expect(mockPinoInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
        }),
        expect.any(String)
      );
    });
  });

  describe('logConnectivityCheck', () => {
    it('should log successful check as DEBUG (not to DB)', async () => {
      await logger.logConnectivityCheck('8.8.8.8', true, 15);

      expect(mockPinoDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          target: '8.8.8.8',
          isConnected: true,
          latencyMs: 15,
        }),
        'Connectivity check passed: 8.8.8.8 (15ms)'
      );
      expect(mockSystemLogCreate).not.toHaveBeenCalled();
    });

    it('should log failed check as WARN (to DB)', async () => {
      await logger.logConnectivityCheck('8.8.8.8', false, null);

      expect(mockPinoWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          target: '8.8.8.8',
          isConnected: false,
          latencyMs: null,
        }),
        'Connectivity check failed: 8.8.8.8'
      );
      expect(mockSystemLogCreate).toHaveBeenCalled();
    });
  });

  describe('logOutage', () => {
    it('should log outage start as CRITICAL', async () => {
      await logger.logOutage('started', 'outage-123');

      expect(mockPinoFatal).toHaveBeenCalled();
      expect(mockSystemLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          level: 'CRITICAL',
          message: 'Outage detected and tracked (ID: outage-123)',
        }),
      });
    });

    it('should log outage resolution as WARN', async () => {
      await logger.logOutage('resolved', 'outage-123', 300);

      expect(mockPinoWarn).toHaveBeenCalled();
      expect(mockSystemLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          level: 'WARN',
          message: 'Outage resolved (ID: outage-123, Duration: 300s)',
        }),
      });
    });

    it('should include metadata in database write', async () => {
      await logger.logOutage('resolved', 'outage-123', 300, { target: '8.8.8.8' });

      expect(mockSystemLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.stringContaining('outage-123'),
        }),
      });
    });
  });

  describe('logEmail', () => {
    it('should log successful email as INFO (not to DB)', async () => {
      await logger.logEmail('success', 'admin@example.com', 'Connection Restored');

      expect(mockPinoInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: 'admin@example.com',
          subject: 'Connection Restored',
        }),
        'Email sent successfully to admin@example.com: Connection Restored'
      );
      expect(mockSystemLogCreate).not.toHaveBeenCalled();
    });

    it('should log failed email as ERROR (to DB)', async () => {
      await logger.logEmail('failure', 'admin@example.com', 'Connection Restored', {
        error: 'SMTP timeout',
      });

      expect(mockPinoError).toHaveBeenCalled();
      expect(mockSystemLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          level: 'ERROR',
          message: 'Failed to send email to admin@example.com: Connection Restored',
        }),
      });
    });
  });

  describe('logAuth', () => {
    it('should log successful login as INFO (not to DB)', async () => {
      await logger.logAuth('login_success', 'user@example.com');

      expect(mockPinoInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'login_success',
          email: 'user@example.com',
        }),
        'User logged in: user@example.com'
      );
      expect(mockSystemLogCreate).not.toHaveBeenCalled();
    });

    it('should log failed login as WARN (to DB)', async () => {
      await logger.logAuth('login_failure', 'attacker@example.com');

      expect(mockPinoWarn).toHaveBeenCalled();
      expect(mockSystemLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          level: 'WARN',
          message: 'Failed login attempt: attacker@example.com',
        }),
      });
    });

    it('should log logout as INFO (not to DB)', async () => {
      await logger.logAuth('logout', 'user@example.com');

      expect(mockPinoInfo).toHaveBeenCalled();
      expect(mockSystemLogCreate).not.toHaveBeenCalled();
    });
  });

  describe('logLifecycle', () => {
    it('should log startup as INFO', async () => {
      await logger.logLifecycle('startup');

      expect(mockPinoInfo).toHaveBeenCalledWith(
        { event: 'startup' },
        'Application starting'
      );
    });

    it('should log monitoring_started as INFO', async () => {
      await logger.logLifecycle('monitoring_started', { interval: 300 });

      expect(mockPinoInfo).toHaveBeenCalledWith(
        { event: 'monitoring_started', interval: 300 },
        'Monitoring system started'
      );
    });

    it('should log speedtest_monitoring_started as INFO', async () => {
      await logger.logLifecycle('speedtest_monitoring_started');

      expect(mockPinoInfo).toHaveBeenCalledWith(
        { event: 'speedtest_monitoring_started' },
        'Speed test monitoring started'
      );
    });
  });

  describe('logSettings', () => {
    it('should log target_added as WARN (to DB for audit)', async () => {
      await logger.logSettings('target_added', '8.8.8.8');

      expect(mockPinoWarn).toHaveBeenCalled();
      expect(mockSystemLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          level: 'WARN',
          message: 'Monitoring target added: 8.8.8.8',
        }),
      });
    });

    it('should include action and target name in metadata', async () => {
      await logger.logSettings('target_deleted', 'google.com', { userId: 'admin' });

      expect(mockSystemLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.stringContaining('target_deleted'),
        }),
      });
    });
  });

  describe('withTiming', () => {
    it('should measure and log execution time on success', async () => {
      const result = await logger.withTiming(
        'Database query',
        async () => {
          return 'query result';
        }
      );

      expect(result).toBe('query result');
      expect(mockPinoDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'Database query',
          duration: expect.any(Number),
        }),
        expect.stringContaining('Database query completed')
      );
    });

    it('should log error and rethrow on failure', async () => {
      const error = new Error('Query failed');

      await expect(
        logger.withTiming('Database query', async () => {
          throw error;
        })
      ).rejects.toThrow('Query failed');

      expect(mockPinoError).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'Database query',
          error: 'Query failed',
        }),
        expect.stringContaining('Database query failed')
      );
    });

    it('should include metadata in timing logs', async () => {
      await logger.withTiming(
        'API call',
        async () => 'result',
        { endpoint: '/api/test' }
      );

      expect(mockPinoDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/test',
        }),
        expect.any(String)
      );
    });
  });
});
