/**
 * Tests for scheduler.ts
 *
 * Tests the monitoring scheduler including:
 * - Starting/stopping monitoring
 * - Adaptive monitoring (normal vs outage mode)
 * - Speed test scheduling
 * - Error handling
 */

import {
  startMonitoring,
  stopMonitoring,
  restartMonitoring,
} from '../scheduler';

// Mock dependencies
jest.mock('../connectivity-checker');
jest.mock('../speed-tester');
jest.mock('@/lib/settings');
jest.mock('@/lib/db', () => ({
  prisma: {
    speedTest: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));
jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withTiming: jest.fn((_name, fn) => fn()),
    logLifecycle: jest.fn(),
  },
}));
jest.mock('@/lib/env', () => ({
  env: {
    ENABLE_SPEED_TEST: 'false',
    SPEED_TEST_INTERVAL_SECONDS: '1800',
    NODE_ENV: 'test',
    ENABLE_MONITORING: 'true',
  },
}));

import { ConnectivityChecker } from '../connectivity-checker';
import { SpeedTester } from '../speed-tester';
import { getMonitoringIntervals } from '@/lib/settings';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

describe('scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementation for getMonitoringIntervals
    (getMonitoringIntervals as jest.Mock).mockResolvedValue({
      checkIntervalSeconds: 300, // 5 minutes
      outageCheckIntervalSeconds: 30, // 30 seconds
    });

    // Default mock for ConnectivityChecker
    const mockCheckConnection = jest.fn().mockResolvedValue({
      isConnected: true,
      latencyMs: 20,
      target: '8.8.8.8',
      timestamp: new Date(),
    });

    const mockHandleConnectionStatus = jest.fn().mockResolvedValue(undefined);

    (ConnectivityChecker as jest.Mock).mockImplementation(() => ({
      checkConnection: mockCheckConnection,
      handleConnectionStatus: mockHandleConnectionStatus,
    }));
  });

  afterEach(() => {
    // Stop monitoring to clean up
    stopMonitoring();
  });

  describe('startMonitoring', () => {
    it('should load intervals from settings', async () => {
      await startMonitoring();

      expect(getMonitoringIntervals).toHaveBeenCalled();
    });

    it('should log monitoring started event', async () => {
      await startMonitoring();

      expect(logger.logLifecycle).toHaveBeenCalledWith('monitoring_started', {
        intervalSeconds: 300,
        outageIntervalSeconds: 30,
      });
    });

    it('should run connectivity check immediately on startup', async () => {
      const mockCheckConnection = jest.fn().mockResolvedValue({
        isConnected: true,
        latencyMs: 20,
        target: '8.8.8.8',
        timestamp: new Date(),
      });

      (ConnectivityChecker as jest.Mock).mockImplementation(() => ({
        checkConnection: mockCheckConnection,
        handleConnectionStatus: jest.fn().mockResolvedValue(undefined),
      }));

      await startMonitoring();

      // The immediate check should have been called during startMonitoring
      expect(mockCheckConnection).toHaveBeenCalled();
    });

    it('should create ConnectivityChecker instance', async () => {
      await startMonitoring();

      expect(ConnectivityChecker).toHaveBeenCalled();
    });

    it('should not start monitoring if already running', async () => {
      await startMonitoring();

      // Try to start again
      await startMonitoring();

      expect(logger.debug).toHaveBeenCalledWith('Monitoring already running');
    });

    it('should start speed test monitoring if enabled', async () => {
      (env as any).ENABLE_SPEED_TEST = 'true';

      const mockRunSpeedTest = jest.fn().mockResolvedValue(undefined);
      (SpeedTester as jest.Mock).mockImplementation(() => ({
        runSpeedTest: mockRunSpeedTest,
      }));

      await startMonitoring();

      expect(logger.logLifecycle).toHaveBeenCalledWith('speedtest_monitoring_started', {
        intervalSeconds: 1800,
      });

      (env as any).ENABLE_SPEED_TEST = 'false';
    });

    it('should not start speed test monitoring if disabled', async () => {
      (env as any).ENABLE_SPEED_TEST = 'false';

      await startMonitoring();

      expect(logger.logLifecycle).not.toHaveBeenCalledWith(
        'speedtest_monitoring_started',
        expect.any(Object)
      );
    });

    it('should use correct speed test interval', async () => {
      (env as any).ENABLE_SPEED_TEST = 'true';
      (env as any).SPEED_TEST_INTERVAL_SECONDS = '3600';

      const mockRunSpeedTest = jest.fn().mockResolvedValue(undefined);
      (SpeedTester as jest.Mock).mockImplementation(() => ({
        runSpeedTest: mockRunSpeedTest,
      }));

      await startMonitoring();

      expect(logger.logLifecycle).toHaveBeenCalledWith('speedtest_monitoring_started', {
        intervalSeconds: 3600,
      });

      (env as any).ENABLE_SPEED_TEST = 'false';
      (env as any).SPEED_TEST_INTERVAL_SECONDS = '1800';
    });
  });

  describe('stopMonitoring', () => {
    it('should log monitoring stopped event', async () => {
      await startMonitoring();

      stopMonitoring();

      expect(logger.logLifecycle).toHaveBeenCalledWith('monitoring_stopped');
    });

    it('should allow restarting after stop', async () => {
      await startMonitoring();
      stopMonitoring();

      // Clear previous calls
      jest.clearAllMocks();

      // Should be able to start again
      await startMonitoring();

      expect(logger.logLifecycle).toHaveBeenCalledWith('monitoring_started', expect.any(Object));
    });

    it('should stop speed test monitoring if running', async () => {
      (env as any).ENABLE_SPEED_TEST = 'true';
      (SpeedTester as jest.Mock).mockImplementation(() => ({
        runSpeedTest: jest.fn().mockResolvedValue(undefined),
      }));

      await startMonitoring();

      stopMonitoring();

      expect(logger.logLifecycle).toHaveBeenCalledWith('speedtest_monitoring_stopped');

      (env as any).ENABLE_SPEED_TEST = 'false';
    });

    it('should handle stop when not running', () => {
      // Should not throw
      expect(() => stopMonitoring()).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle errors during connectivity check', async () => {
      const mockCheckConnection = jest.fn().mockRejectedValue(new Error('Network error'));

      (ConnectivityChecker as jest.Mock).mockImplementation(() => ({
        checkConnection: mockCheckConnection,
        handleConnectionStatus: jest.fn().mockResolvedValue(undefined),
      }));

      // Should not throw
      await expect(startMonitoring()).resolves.not.toThrow();
    });

    it('should log errors from connectivity check', async () => {
      const mockCheckConnection = jest.fn().mockRejectedValue(new Error('Network error'));

      (ConnectivityChecker as jest.Mock).mockImplementation(() => ({
        checkConnection: mockCheckConnection,
        handleConnectionStatus: jest.fn().mockResolvedValue(undefined),
      }));

      await startMonitoring();

      // Give time for the async check to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(logger.error).toHaveBeenCalledWith('Error during connectivity check', {
        error: 'Network error',
      });
    });

    it('should handle errors loading monitoring intervals', async () => {
      (getMonitoringIntervals as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await expect(startMonitoring()).rejects.toThrow('Database error');
    });
  });

  describe('restartMonitoring', () => {
    it('should stop and restart monitoring', async () => {
      await startMonitoring();

      // Mock new intervals
      (getMonitoringIntervals as jest.Mock).mockResolvedValue({
        checkIntervalSeconds: 60, // Changed to 1 minute
        outageCheckIntervalSeconds: 15, // Changed to 15 seconds
      });

      await restartMonitoring();

      expect(logger.info).toHaveBeenCalledWith('Restarting monitoring with updated settings');
      expect(logger.info).toHaveBeenCalledWith('Monitoring restarted successfully');
      expect(logger.logLifecycle).toHaveBeenCalledWith('monitoring_stopped');
      expect(logger.logLifecycle).toHaveBeenCalledWith('monitoring_started', {
        intervalSeconds: 60,
        outageIntervalSeconds: 15,
      });
    });

    it('should handle restart when not running', async () => {
      // Should not throw
      await expect(restartMonitoring()).resolves.not.toThrow();
    });

    it('should apply new settings after restart', async () => {
      (getMonitoringIntervals as jest.Mock).mockResolvedValue({
        checkIntervalSeconds: 300,
        outageCheckIntervalSeconds: 30,
      });

      await startMonitoring();

      // Change settings
      (getMonitoringIntervals as jest.Mock).mockResolvedValue({
        checkIntervalSeconds: 120,
        outageCheckIntervalSeconds: 20,
      });

      await restartMonitoring();

      // Verify new settings were loaded
      expect(logger.logLifecycle).toHaveBeenCalledWith('monitoring_started', {
        intervalSeconds: 120,
        outageIntervalSeconds: 20,
      });
    });
  });

  describe('adaptive monitoring behavior', () => {
    it('should call handleConnectionStatus after check', async () => {
      const mockCheckConnection = jest.fn().mockResolvedValue({
        isConnected: true,
        latencyMs: 20,
        target: '8.8.8.8',
        timestamp: new Date(),
      });

      const mockHandleConnectionStatus = jest.fn().mockResolvedValue(undefined);

      (ConnectivityChecker as jest.Mock).mockImplementation(() => ({
        checkConnection: mockCheckConnection,
        handleConnectionStatus: mockHandleConnectionStatus,
      }));

      await startMonitoring();

      // Both methods should be called
      expect(mockCheckConnection).toHaveBeenCalled();
      expect(mockHandleConnectionStatus).toHaveBeenCalled();
    });

    it('should log check results in debug mode', async () => {
      const mockCheckConnection = jest.fn().mockResolvedValue({
        isConnected: true,
        latencyMs: 20,
        target: '8.8.8.8',
        timestamp: new Date(),
      });

      (ConnectivityChecker as jest.Mock).mockImplementation(() => ({
        checkConnection: mockCheckConnection,
        handleConnectionStatus: jest.fn().mockResolvedValue(undefined),
      }));

      await startMonitoring();

      // Wait for async check to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(logger.debug).toHaveBeenCalledWith(
        'Running connectivity check...',
        expect.objectContaining({ mode: 'normal' })
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'Check complete: CONNECTED',
        expect.objectContaining({
          isConnected: true,
          target: '8.8.8.8',
          latencyMs: 20,
          mode: 'normal',
        })
      );
    });

    it('should log disconnected state correctly', async () => {
      const mockCheckConnection = jest.fn().mockResolvedValue({
        isConnected: false,
        latencyMs: null,
        target: 'multiple',
        timestamp: new Date(),
      });

      (ConnectivityChecker as jest.Mock).mockImplementation(() => ({
        checkConnection: mockCheckConnection,
        handleConnectionStatus: jest.fn().mockResolvedValue(undefined),
      }));

      await startMonitoring();

      // Wait for async check to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(logger.debug).toHaveBeenCalledWith(
        'Check complete: DISCONNECTED',
        expect.objectContaining({
          isConnected: false,
          mode: 'normal',
        })
      );
    });
  });

  describe('speed test functionality', () => {
    it('should create SpeedTester when enabled', async () => {
      (env as any).ENABLE_SPEED_TEST = 'true';
      (SpeedTester as jest.Mock).mockImplementation(() => ({
        runSpeedTest: jest.fn().mockResolvedValue(undefined),
      }));

      await startMonitoring();

      expect(SpeedTester).toHaveBeenCalled();

      (env as any).ENABLE_SPEED_TEST = 'false';
    });

    it('should not create SpeedTester when disabled', async () => {
      (env as any).ENABLE_SPEED_TEST = 'false';

      await startMonitoring();

      expect(SpeedTester).not.toHaveBeenCalled();
    });

    it('should handle speed test errors gracefully', async () => {
      (env as any).ENABLE_SPEED_TEST = 'true';

      const mockRunSpeedTest = jest.fn().mockRejectedValue(new Error('Speed test failed'));
      (SpeedTester as jest.Mock).mockImplementation(() => ({
        runSpeedTest: mockRunSpeedTest,
      }));

      // Should not throw
      await expect(startMonitoring()).resolves.not.toThrow();

      (env as any).ENABLE_SPEED_TEST = 'false';
    });
  });

  describe('module state management', () => {
    it('should track connectivity task state', async () => {
      await startMonitoring();

      // Attempting to start again should detect existing task
      await startMonitoring();
      expect(logger.debug).toHaveBeenCalledWith('Monitoring already running');
    });

    it('should reset state on stop', async () => {
      await startMonitoring();
      stopMonitoring();

      // Clear mocks
      jest.clearAllMocks();

      // Should allow starting again
      await startMonitoring();
      expect(logger.logLifecycle).toHaveBeenCalledWith('monitoring_started', expect.any(Object));
    });
  });
});
