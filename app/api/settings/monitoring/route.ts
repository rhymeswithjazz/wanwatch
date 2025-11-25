import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withAuth, withAuthRequest } from '@/lib/api-utils';
import {
  getMonitoringIntervals,
  updateMonitoringIntervals,
  getDefaultIntervals,
  resetToDefaultIntervals
} from '@/lib/settings';

/**
 * GET /api/settings/monitoring
 * Returns current monitoring intervals and defaults
 */
export const GET = withAuth(
  async () => {
    const current = await getMonitoringIntervals();
    const defaults = getDefaultIntervals();

    return NextResponse.json({
      current,
      defaults,
      isUsingDefaults: current.checkIntervalSeconds === defaults.checkIntervalSeconds &&
                      current.outageCheckIntervalSeconds === defaults.outageCheckIntervalSeconds
    });
  },
  { route: '/api/settings/monitoring', method: 'GET' }
);

/**
 * POST /api/settings/monitoring
 * Updates monitoring intervals
 */
export const POST = withAuthRequest(
  async (request: NextRequest, session) => {
    const body = await request.json();

    // Handle reset to defaults
    if (body.reset === true) {
      await resetToDefaultIntervals();

      await logger.info('Monitoring intervals reset to defaults', {
        email: session.user?.email
      });

      // Trigger scheduler restart
      const { restartMonitoring } = await import('@/lib/monitoring/scheduler');
      await restartMonitoring();

      return NextResponse.json({
        success: true,
        message: 'Intervals reset to defaults',
        intervals: getDefaultIntervals()
      });
    }

    // Validate input
    const { checkIntervalSeconds, outageCheckIntervalSeconds } = body;

    if (typeof checkIntervalSeconds !== 'number' || typeof outageCheckIntervalSeconds !== 'number') {
      return NextResponse.json(
        { error: 'Invalid interval values' },
        { status: 400 }
      );
    }

    // Update intervals
    await updateMonitoringIntervals({
      checkIntervalSeconds,
      outageCheckIntervalSeconds
    });

    await logger.info('Monitoring intervals updated', {
      checkIntervalSeconds,
      outageCheckIntervalSeconds,
      email: session.user?.email
    });

    // Trigger scheduler restart with new intervals
    const { restartMonitoring } = await import('@/lib/monitoring/scheduler');
    await restartMonitoring();

    return NextResponse.json({
      success: true,
      message: 'Intervals updated successfully',
      intervals: { checkIntervalSeconds, outageCheckIntervalSeconds }
    });
  },
  { route: '/api/settings/monitoring', method: 'POST' }
);
