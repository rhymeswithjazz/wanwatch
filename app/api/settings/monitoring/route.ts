import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/utils';
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
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const current = await getMonitoringIntervals();
    const defaults = getDefaultIntervals();

    return NextResponse.json({
      current,
      defaults,
      isUsingDefaults: current.checkIntervalSeconds === defaults.checkIntervalSeconds &&
                      current.outageCheckIntervalSeconds === defaults.outageCheckIntervalSeconds
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    await logger.error('Failed to get monitoring intervals', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to get monitoring intervals' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/monitoring
 * Updates monitoring intervals
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Handle reset to defaults
    if (body.reset === true) {
      await resetToDefaultIntervals();

      await logger.info('Monitoring intervals reset to defaults', {
        email: session.user.email
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
      email: session.user.email
    });

    // Trigger scheduler restart with new intervals
    const { restartMonitoring } = await import('@/lib/monitoring/scheduler');
    await restartMonitoring();

    return NextResponse.json({
      success: true,
      message: 'Intervals updated successfully',
      intervals: { checkIntervalSeconds, outageCheckIntervalSeconds }
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    await logger.error('Failed to update monitoring intervals', { error: errorMessage });

    return NextResponse.json(
      { error: errorMessage },
      { status: 400 }
    );
  }
}
