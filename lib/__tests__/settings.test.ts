/**
 * Tests for Settings Management
 *
 * Tests the hybrid database/environment configuration system including:
 * - Loading intervals from database
 * - Fallback to environment variables
 * - Validation of interval constraints
 * - Reset functionality
 */

import {
  getMonitoringIntervals,
  updateMonitoringIntervals,
  getDefaultIntervals,
  resetToDefaultIntervals,
  MonitoringIntervals,
} from '../settings';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    settings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock env
const mockEnv: Record<string, string> = {};

jest.mock('@/lib/env', () => ({
  env: new Proxy({} as Record<string, string>, {
    get: (_target, prop: string) => mockEnv[prop],
  }),
}));

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

describe('Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset env defaults
    mockEnv.CHECK_INTERVAL_SECONDS = '300';
    mockEnv.OUTAGE_CHECK_INTERVAL_SECONDS = '30';
  });

  describe('getMonitoringIntervals', () => {
    it('should return intervals from database when settings exist', async () => {
      (prisma.settings.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        checkIntervalSeconds: 600,
        outageCheckIntervalSeconds: 60,
      });

      const intervals = await getMonitoringIntervals();

      expect(prisma.settings.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(intervals).toEqual({
        checkIntervalSeconds: 600,
        outageCheckIntervalSeconds: 60,
      });
    });

    it('should log debug message when loading from database', async () => {
      (prisma.settings.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        checkIntervalSeconds: 600,
        outageCheckIntervalSeconds: 60,
      });

      await getMonitoringIntervals();

      expect(logger.debug).toHaveBeenCalledWith(
        'Loaded monitoring intervals from database',
        {
          checkIntervalSeconds: 600,
          outageCheckIntervalSeconds: 60,
        }
      );
    });

    it('should fallback to environment variables when no database settings', async () => {
      (prisma.settings.findUnique as jest.Mock).mockResolvedValue(null);

      const intervals = await getMonitoringIntervals();

      expect(intervals).toEqual({
        checkIntervalSeconds: 300,
        outageCheckIntervalSeconds: 30,
      });
    });

    it('should log debug message when using env vars', async () => {
      (prisma.settings.findUnique as jest.Mock).mockResolvedValue(null);

      await getMonitoringIntervals();

      expect(logger.debug).toHaveBeenCalledWith(
        'Using monitoring intervals from environment variables',
        {
          checkIntervalSeconds: 300,
          outageCheckIntervalSeconds: 30,
        }
      );
    });

    it('should fallback to env vars on database error', async () => {
      (prisma.settings.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const intervals = await getMonitoringIntervals();

      expect(intervals).toEqual({
        checkIntervalSeconds: 300,
        outageCheckIntervalSeconds: 30,
      });
    });

    it('should log warning on database error', async () => {
      (prisma.settings.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await getMonitoringIntervals();

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to load monitoring intervals from database, using env vars',
        { error: 'Database connection failed' }
      );
    });

    it('should use custom env values as fallback', async () => {
      mockEnv.CHECK_INTERVAL_SECONDS = '900';
      mockEnv.OUTAGE_CHECK_INTERVAL_SECONDS = '45';
      (prisma.settings.findUnique as jest.Mock).mockResolvedValue(null);

      const intervals = await getMonitoringIntervals();

      expect(intervals).toEqual({
        checkIntervalSeconds: 900,
        outageCheckIntervalSeconds: 45,
      });
    });
  });

  describe('updateMonitoringIntervals', () => {
    describe('validation', () => {
      it('should throw error if checkIntervalSeconds is less than 10', async () => {
        const intervals: MonitoringIntervals = {
          checkIntervalSeconds: 5,
          outageCheckIntervalSeconds: 30,
        };

        await expect(updateMonitoringIntervals(intervals)).rejects.toThrow(
          'checkIntervalSeconds must be between 10 and 3600'
        );
        expect(prisma.settings.upsert).not.toHaveBeenCalled();
      });

      it('should throw error if checkIntervalSeconds is greater than 3600', async () => {
        const intervals: MonitoringIntervals = {
          checkIntervalSeconds: 7200,
          outageCheckIntervalSeconds: 30,
        };

        await expect(updateMonitoringIntervals(intervals)).rejects.toThrow(
          'checkIntervalSeconds must be between 10 and 3600'
        );
      });

      it('should throw error if outageCheckIntervalSeconds is less than 5', async () => {
        const intervals: MonitoringIntervals = {
          checkIntervalSeconds: 300,
          outageCheckIntervalSeconds: 3,
        };

        await expect(updateMonitoringIntervals(intervals)).rejects.toThrow(
          'outageCheckIntervalSeconds must be between 5 and 600'
        );
      });

      it('should throw error if outageCheckIntervalSeconds is greater than 600', async () => {
        const intervals: MonitoringIntervals = {
          checkIntervalSeconds: 300,
          outageCheckIntervalSeconds: 900,
        };

        await expect(updateMonitoringIntervals(intervals)).rejects.toThrow(
          'outageCheckIntervalSeconds must be between 5 and 600'
        );
      });

      it('should throw error if outageCheckIntervalSeconds >= checkIntervalSeconds', async () => {
        const intervals: MonitoringIntervals = {
          checkIntervalSeconds: 30,
          outageCheckIntervalSeconds: 30,
        };

        await expect(updateMonitoringIntervals(intervals)).rejects.toThrow(
          'outageCheckIntervalSeconds must be less than checkIntervalSeconds'
        );
      });

      it('should throw error if outageCheckIntervalSeconds > checkIntervalSeconds', async () => {
        const intervals: MonitoringIntervals = {
          checkIntervalSeconds: 20,
          outageCheckIntervalSeconds: 25,
        };

        await expect(updateMonitoringIntervals(intervals)).rejects.toThrow(
          'outageCheckIntervalSeconds must be less than checkIntervalSeconds'
        );
      });
    });

    describe('successful update', () => {
      it('should upsert settings with valid intervals', async () => {
        const intervals: MonitoringIntervals = {
          checkIntervalSeconds: 600,
          outageCheckIntervalSeconds: 60,
        };

        await updateMonitoringIntervals(intervals);

        expect(prisma.settings.upsert).toHaveBeenCalledWith({
          where: { id: 1 },
          create: {
            id: 1,
            checkIntervalSeconds: 600,
            outageCheckIntervalSeconds: 60,
          },
          update: {
            checkIntervalSeconds: 600,
            outageCheckIntervalSeconds: 60,
          },
        });
      });

      it('should accept boundary values (min)', async () => {
        const intervals: MonitoringIntervals = {
          checkIntervalSeconds: 10,
          outageCheckIntervalSeconds: 5,
        };

        await updateMonitoringIntervals(intervals);

        expect(prisma.settings.upsert).toHaveBeenCalled();
      });

      it('should accept boundary values (max)', async () => {
        const intervals: MonitoringIntervals = {
          checkIntervalSeconds: 3600,
          outageCheckIntervalSeconds: 600,
        };

        // This should fail because outageCheckIntervalSeconds < checkIntervalSeconds is required
        // 600 < 3600 is true, so this should pass
        await updateMonitoringIntervals(intervals);

        expect(prisma.settings.upsert).toHaveBeenCalled();
      });

      it('should log info message after update', async () => {
        const intervals: MonitoringIntervals = {
          checkIntervalSeconds: 600,
          outageCheckIntervalSeconds: 60,
        };

        await updateMonitoringIntervals(intervals);

        expect(logger.info).toHaveBeenCalledWith('Updated monitoring intervals', {
          checkIntervalSeconds: 600,
          outageCheckIntervalSeconds: 60,
        });
      });
    });
  });

  describe('getDefaultIntervals', () => {
    it('should return intervals from environment variables', () => {
      const intervals = getDefaultIntervals();

      expect(intervals).toEqual({
        checkIntervalSeconds: 300,
        outageCheckIntervalSeconds: 30,
      });
    });

    it('should return custom env values', () => {
      mockEnv.CHECK_INTERVAL_SECONDS = '120';
      mockEnv.OUTAGE_CHECK_INTERVAL_SECONDS = '15';

      const intervals = getDefaultIntervals();

      expect(intervals).toEqual({
        checkIntervalSeconds: 120,
        outageCheckIntervalSeconds: 15,
      });
    });
  });

  describe('resetToDefaultIntervals', () => {
    it('should delete all settings from database', async () => {
      await resetToDefaultIntervals();

      expect(prisma.settings.deleteMany).toHaveBeenCalledWith({});
    });

    it('should log info message after reset', async () => {
      await resetToDefaultIntervals();

      expect(logger.info).toHaveBeenCalledWith(
        'Reset monitoring intervals to defaults'
      );
    });
  });
});
