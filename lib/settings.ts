import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export interface MonitoringIntervals {
  checkIntervalSeconds: number;
  outageCheckIntervalSeconds: number;
}

/**
 * Get monitoring intervals from database or fallback to environment variables
 * Hybrid approach: Database settings override env vars when present
 */
export async function getMonitoringIntervals(): Promise<MonitoringIntervals> {
  try {
    // Try to get settings from database
    const settings = await prisma.settings.findFirst({
      orderBy: { updatedAt: 'desc' }
    });

    if (settings) {
      logger.debug('Loaded monitoring intervals from database', {
        checkIntervalSeconds: settings.checkIntervalSeconds,
        outageCheckIntervalSeconds: settings.outageCheckIntervalSeconds
      });

      return {
        checkIntervalSeconds: settings.checkIntervalSeconds,
        outageCheckIntervalSeconds: settings.outageCheckIntervalSeconds
      };
    }

    // Fallback to environment variables
    const intervals = {
      checkIntervalSeconds: parseInt(env.CHECK_INTERVAL_SECONDS),
      outageCheckIntervalSeconds: parseInt(env.OUTAGE_CHECK_INTERVAL_SECONDS)
    };

    logger.debug('Using monitoring intervals from environment variables', intervals);
    return intervals;
  } catch (error) {
    // If database error, fallback to env vars
    logger.warn('Failed to load monitoring intervals from database, using env vars', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      checkIntervalSeconds: parseInt(env.CHECK_INTERVAL_SECONDS),
      outageCheckIntervalSeconds: parseInt(env.OUTAGE_CHECK_INTERVAL_SECONDS)
    };
  }
}

/**
 * Update monitoring intervals in database
 */
export async function updateMonitoringIntervals(
  intervals: MonitoringIntervals
): Promise<void> {
  // Validation
  if (intervals.checkIntervalSeconds < 10 || intervals.checkIntervalSeconds > 3600) {
    throw new Error('checkIntervalSeconds must be between 10 and 3600');
  }

  if (intervals.outageCheckIntervalSeconds < 5 || intervals.outageCheckIntervalSeconds > 600) {
    throw new Error('outageCheckIntervalSeconds must be between 5 and 600');
  }

  if (intervals.outageCheckIntervalSeconds >= intervals.checkIntervalSeconds) {
    throw new Error('outageCheckIntervalSeconds must be less than checkIntervalSeconds');
  }

  // Delete existing settings (we only keep one row)
  await prisma.settings.deleteMany({});

  // Create new settings
  await prisma.settings.create({
    data: {
      checkIntervalSeconds: intervals.checkIntervalSeconds,
      outageCheckIntervalSeconds: intervals.outageCheckIntervalSeconds
    }
  });

  await logger.info('Updated monitoring intervals', {
    checkIntervalSeconds: intervals.checkIntervalSeconds,
    outageCheckIntervalSeconds: intervals.outageCheckIntervalSeconds
  });
}

/**
 * Get default intervals from environment variables
 */
export function getDefaultIntervals(): MonitoringIntervals {
  return {
    checkIntervalSeconds: parseInt(env.CHECK_INTERVAL_SECONDS),
    outageCheckIntervalSeconds: parseInt(env.OUTAGE_CHECK_INTERVAL_SECONDS)
  };
}

/**
 * Reset intervals to defaults (delete database settings)
 */
export async function resetToDefaultIntervals(): Promise<void> {
  await prisma.settings.deleteMany({});
  await logger.info('Reset monitoring intervals to defaults');
}
