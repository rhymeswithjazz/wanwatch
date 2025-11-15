/**
 * Tests for ConnectivityChecker
 *
 * Tests the critical connectivity monitoring logic including:
 * - Target management and caching
 * - Ping execution and parsing
 * - Outage detection and resolution
 * - Database logging
 */

import { ConnectivityChecker, ConnectivityResult } from '../connectivity-checker';
import { createMockActiveOutage } from '../../../__tests__/factories/outage.factory';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    connectionCheck: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    outage: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    monitoringTarget: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logConnectivityCheck: jest.fn(),
    logOutage: jest.fn(),
  },
}));

// Mock child_process exec and util.promisify
// Create the mock function inside the factory to avoid hoisting issues
jest.mock('child_process');
jest.mock('util', () => {
  const mockFn = jest.fn();
  const original = jest.requireActual('util');
  return {
    ...original,
    promisify: jest.fn(() => mockFn),
    __mockExecAsync: mockFn, // Export so we can access it
  };
});

// Import mocked modules
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import * as util from 'util';

// Access the mock function we created
const mockExecAsync = (util as any).__mockExecAsync;

describe('ConnectivityChecker', () => {
  let checker: ConnectivityChecker;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    checker = new ConnectivityChecker();

    // Default: return some targets
    (prisma.monitoringTarget.findMany as jest.Mock).mockResolvedValue([
      { target: '8.8.8.8' },
      { target: '1.1.1.1' },
      { target: 'google.com' },
    ]);
  });

  describe('getTargets (private method - tested via public methods)', () => {
    it('should load targets from database on first call', async () => {
      await checker.checkConnection();

      expect(prisma.monitoringTarget.findMany).toHaveBeenCalledWith({
        where: { isEnabled: true },
        orderBy: { priority: 'asc' },
        select: { target: true },
      });
    });

    it('should cache targets and not query database again within cache duration', async () => {
      // First call
      await checker.checkConnection();
      expect(prisma.monitoringTarget.findMany).toHaveBeenCalledTimes(1);

      // Second call within cache duration
      await checker.checkConnection();
      expect(prisma.monitoringTarget.findMany).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('should log targets loaded from database', async () => {
      await checker.checkConnection();

      expect(logger.debug).toHaveBeenCalledWith(
        'Monitoring targets loaded from database',
        expect.objectContaining({
          count: 3,
          targets: expect.arrayContaining(['8.8.8.8', '1.1.1.1', 'google.com']),
        })
      );
    });
  });

  describe('refreshTargets', () => {
    it('should force reload targets from database', async () => {
      // First load
      await checker.checkConnection();
      expect(prisma.monitoringTarget.findMany).toHaveBeenCalledTimes(1);

      // Refresh
      await checker.refreshTargets();
      expect(prisma.monitoringTarget.findMany).toHaveBeenCalledTimes(2);
    });

    it('should update cache after refresh', async () => {
      // Initial targets
      (prisma.monitoringTarget.findMany as jest.Mock).mockResolvedValue([
        { target: '8.8.8.8' },
      ]);

      await checker.checkConnection();

      // Change targets in database
      (prisma.monitoringTarget.findMany as jest.Mock).mockResolvedValue([
        { target: '1.1.1.1' },
        { target: '9.9.9.9' },
      ]);

      // Refresh should get new targets
      await checker.refreshTargets();

      expect(logger.debug).toHaveBeenLastCalledWith(
        'Monitoring targets loaded from database',
        expect.objectContaining({
          count: 2,
          targets: expect.arrayContaining(['1.1.1.1', '9.9.9.9']),
        })
      );
    });
  });

  describe('checkConnection', () => {
    describe('when no targets are configured', () => {
      beforeEach(() => {
        (prisma.monitoringTarget.findMany as jest.Mock).mockResolvedValue([]);
      });

      it('should return disconnected status', async () => {
        const result = await checker.checkConnection();

        expect(result.isConnected).toBe(false);
        expect(result.target).toBe('no-targets-configured');
        expect(result.latencyMs).toBeNull();
      });

      it('should log error about missing targets', async () => {
        await checker.checkConnection();

        expect(logger.error).toHaveBeenCalledWith(
          'No enabled monitoring targets found',
          expect.objectContaining({ action: 'check_connection' })
        );
      });
    });

    describe('when first target succeeds', () => {
      beforeEach(() => {
        // Mock successful ping
        mockExecAsync.mockResolvedValue({
          stdout: 'PING 8.8.8.8: 64 bytes from 8.8.8.8: icmp_seq=0 ttl=117 time=15.2 ms',
          stderr: '',
        });
      });

      it('should return connected status with latency', async () => {
        const result = await checker.checkConnection();

        expect(result.isConnected).toBe(true);
        expect(result.latencyMs).toBe(15.2);
        expect(result.target).toBe('8.8.8.8');
        expect(result.timestamp).toBeInstanceOf(Date);
      });

      it('should save successful check to database', async () => {
        await checker.checkConnection();

        expect(prisma.connectionCheck.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            isConnected: true,
            latencyMs: 15.2,
            target: '8.8.8.8',
            timestamp: expect.any(Date),
          }),
        });
      });

      it('should log connectivity success', async () => {
        await checker.checkConnection();

        expect(logger.logConnectivityCheck).toHaveBeenCalledWith(
          '8.8.8.8',
          true,
          15.2
        );
      });

      it('should not try remaining targets', async () => {
        await checker.checkConnection();

        // Only one ping command for first target
        expect(mockExecAsync).toHaveBeenCalledTimes(1);
        expect(mockExecAsync).toHaveBeenCalledWith('ping -c 1 -W 5 8.8.8.8');
      });
    });

    describe('when first target fails but second succeeds', () => {
      beforeEach(() => {
        // First call fails, second call succeeds
        mockExecAsync
          .mockRejectedValueOnce(new Error('Host unreachable'))
          .mockResolvedValueOnce({
            stdout: 'PING 1.1.1.1: 64 bytes from 1.1.1.1: time=20.5 ms',
            stderr: '',
          });
      });

      it('should return connected status from second target', async () => {
        const result = await checker.checkConnection();

        expect(result.isConnected).toBe(true);
        expect(result.latencyMs).toBe(20.5);
        expect(result.target).toBe('1.1.1.1');
      });

      it('should not throw error on failed target', async () => {
        // pingTarget catches errors and returns isConnected: false
        // The loop continues to next target without logging individual failures
        await expect(checker.checkConnection()).resolves.toBeDefined();
      });

      it('should try targets in order until one succeeds', async () => {
        await checker.checkConnection();

        expect(mockExecAsync).toHaveBeenCalledTimes(2);
        expect(mockExecAsync).toHaveBeenNthCalledWith(1, 'ping -c 1 -W 5 8.8.8.8');
        expect(mockExecAsync).toHaveBeenNthCalledWith(2, 'ping -c 1 -W 5 1.1.1.1');
      });
    });

    describe('when all targets fail', () => {
      beforeEach(() => {
        mockExecAsync.mockRejectedValue(new Error('Network unreachable'));
      });

      it('should return disconnected status', async () => {
        const result = await checker.checkConnection();

        expect(result.isConnected).toBe(false);
        expect(result.latencyMs).toBeNull();
        expect(result.target).toBe('multiple');
      });

      it('should save failed check to database', async () => {
        await checker.checkConnection();

        expect(prisma.connectionCheck.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            isConnected: false,
            target: 'all-targets-failed',
            timestamp: expect.any(Date),
          }),
        });
      });

      it('should log connectivity failure', async () => {
        await checker.checkConnection();

        expect(logger.logConnectivityCheck).toHaveBeenCalledWith(
          'all-targets',
          false,
          null,
          expect.objectContaining({ targetsAttempted: 3 })
        );
      });

      it('should try all configured targets', async () => {
        await checker.checkConnection();

        expect(mockExecAsync).toHaveBeenCalledTimes(3);
      });
    });

    describe('latency parsing', () => {
      it('should parse latency with decimal', async () => {
        mockExecAsync.mockResolvedValue({
          stdout: 'time=42.7 ms',
          stderr: '',
        });

        const result = await checker.checkConnection();
        expect(result.latencyMs).toBe(42.7);
      });

      it('should parse latency without decimal', async () => {
        mockExecAsync.mockResolvedValue({
          stdout: 'time=15 ms',
          stderr: '',
        });

        const result = await checker.checkConnection();
        expect(result.latencyMs).toBe(15);
      });

      it('should handle missing latency in output', async () => {
        mockExecAsync.mockResolvedValue({
          stdout: 'PING successful but no time reported',
          stderr: '',
        });

        const result = await checker.checkConnection();
        expect(result.latencyMs).toBeNull();
      });
    });
  });

  describe('handleConnectionStatus', () => {
    const createConnectivityResult = (overrides: Partial<ConnectivityResult> = {}): ConnectivityResult => ({
      isConnected: true,
      latencyMs: 20,
      target: '8.8.8.8',
      timestamp: new Date('2025-01-15T12:00:00Z'),
      ...overrides,
    });

    describe('when disconnected with no active outage', () => {
      beforeEach(() => {
        (prisma.outage.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.outage.create as jest.Mock).mockResolvedValue({
          id: 1,
          startTime: new Date('2025-01-15T12:00:00Z'),
          checksCount: 1,
        });
      });

      it('should create new outage', async () => {
        const result = createConnectivityResult({ isConnected: false });

        await checker.handleConnectionStatus(result);

        expect(prisma.outage.create).toHaveBeenCalledWith({
          data: {
            startTime: result.timestamp,
            checksCount: 1,
          },
        });
      });

      it('should log outage started event', async () => {
        const result = createConnectivityResult({ isConnected: false });

        await checker.handleConnectionStatus(result);

        expect(logger.logOutage).toHaveBeenCalledWith(
          'started',
          '1',
          undefined,
          expect.objectContaining({
            timestamp: result.timestamp.toISOString(),
          })
        );
      });
    });

    describe('when disconnected with active outage', () => {
      const activeOutage = createMockActiveOutage({
        id: '1',
        checksCount: 5,
      });

      beforeEach(() => {
        (prisma.outage.findFirst as jest.Mock).mockResolvedValue(activeOutage);
      });

      it('should increment checksCount', async () => {
        const result = createConnectivityResult({ isConnected: false });

        await checker.handleConnectionStatus(result);

        expect(prisma.outage.update).toHaveBeenCalledWith({
          where: { id: activeOutage.id },
          data: {
            checksCount: { increment: 1 },
          },
        });
      });

      it('should log that outage continues', async () => {
        const result = createConnectivityResult({ isConnected: false });

        await checker.handleConnectionStatus(result);

        expect(logger.debug).toHaveBeenCalledWith(
          'Outage continues',
          expect.objectContaining({
            outageId: activeOutage.id,
            checksCount: 6, // Original 5 + 1
          })
        );
      });

      it('should not create new outage', async () => {
        const result = createConnectivityResult({ isConnected: false });

        await checker.handleConnectionStatus(result);

        expect(prisma.outage.create).not.toHaveBeenCalled();
      });
    });

    describe('when connected with active outage (recovery)', () => {
      const activeOutage = createMockActiveOutage({
        id: '1',
        startTime: new Date('2025-01-15T12:00:00Z'),
        checksCount: 10,
      });

      beforeEach(() => {
        (prisma.outage.findFirst as jest.Mock).mockResolvedValue(activeOutage);

        // Mock email notifier
        jest.mock('../email-notifier', () => ({
          sendOutageRestoredEmail: jest.fn().mockResolvedValue(undefined),
        }));
      });

      it('should calculate duration correctly', async () => {
        const result = createConnectivityResult({
          isConnected: true,
          timestamp: new Date('2025-01-15T12:05:00Z'), // 5 minutes after outage start
        });

        await checker.handleConnectionStatus(result);

        expect(prisma.outage.update).toHaveBeenCalledWith({
          where: { id: activeOutage.id },
          data: {
            endTime: result.timestamp,
            durationSec: 300, // 5 minutes = 300 seconds
            isResolved: true,
          },
        });
      });

      it('should log outage resolution', async () => {
        const result = createConnectivityResult({
          isConnected: true,
          timestamp: new Date('2025-01-15T12:05:00Z'),
        });

        await checker.handleConnectionStatus(result);

        expect(logger.logOutage).toHaveBeenCalledWith(
          'resolved',
          '1',
          300,
          expect.objectContaining({
            startTime: activeOutage.startTime.toISOString(),
            endTime: result.timestamp.toISOString(),
          })
        );
      });

      it('should handle sub-second durations correctly', async () => {
        const result = createConnectivityResult({
          isConnected: true,
          timestamp: new Date(activeOutage.startTime.getTime() + 500), // 500ms later
        });

        await checker.handleConnectionStatus(result);

        expect(prisma.outage.update).toHaveBeenCalledWith({
          where: { id: activeOutage.id },
          data: {
            endTime: result.timestamp,
            durationSec: 0, // Less than 1 second rounds to 0
            isResolved: true,
          },
        });
      });
    });

    describe('when connected with no active outage (normal operation)', () => {
      beforeEach(() => {
        (prisma.outage.findFirst as jest.Mock).mockResolvedValue(null);
      });

      it('should not create or update any outages', async () => {
        const result = createConnectivityResult({ isConnected: true });

        await checker.handleConnectionStatus(result);

        expect(prisma.outage.create).not.toHaveBeenCalled();
        expect(prisma.outage.update).not.toHaveBeenCalled();
      });

      it('should not log any outage events', async () => {
        const result = createConnectivityResult({ isConnected: true });

        await checker.handleConnectionStatus(result);

        expect(logger.logOutage).not.toHaveBeenCalled();
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle database errors gracefully when loading targets', async () => {
      (prisma.monitoringTarget.findMany as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(checker.checkConnection()).rejects.toThrow('Database connection failed');
    });

    it('should handle database errors when creating connection check', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'time=15 ms', stderr: '' });

      (prisma.connectionCheck.create as jest.Mock).mockRejectedValue(
        new Error('Database write failed')
      );

      await expect(checker.checkConnection()).rejects.toThrow('Database write failed');
    });

    it('should handle rapid state changes', async () => {
      // Simulate: disconnected -> connected -> disconnected quickly
      const timestamp1 = new Date('2025-01-15T12:00:00Z');
      const timestamp2 = new Date('2025-01-15T12:00:05Z');
      const timestamp3 = new Date('2025-01-15T12:00:10Z');

      (prisma.outage.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.outage.create as jest.Mock).mockResolvedValue({ id: 1 });

      // First: Create outage
      await checker.handleConnectionStatus({
        isConnected: false,
        latencyMs: null,
        target: '8.8.8.8',
        timestamp: timestamp1,
      });

      expect(prisma.outage.create).toHaveBeenCalledTimes(1);

      // Second: Resolve it
      (prisma.outage.findFirst as jest.Mock).mockResolvedValue({
        id: 1,
        startTime: timestamp1,
        isResolved: false,
        checksCount: 1,
      });

      await checker.handleConnectionStatus({
        isConnected: true,
        latencyMs: 20,
        target: '8.8.8.8',
        timestamp: timestamp2,
      });

      expect(prisma.outage.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ isResolved: true }),
      });

      // Third: New outage (previous was resolved)
      (prisma.outage.findFirst as jest.Mock).mockResolvedValue(null);

      await checker.handleConnectionStatus({
        isConnected: false,
        latencyMs: null,
        target: '8.8.8.8',
        timestamp: timestamp3,
      });

      expect(prisma.outage.create).toHaveBeenCalledTimes(2);
    });
  });
});
