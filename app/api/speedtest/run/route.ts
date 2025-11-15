import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { SpeedTester } from '@/lib/monitoring/speed-tester';
import { logger } from '@/lib/logger';

export async function POST() {
  const startTime = Date.now();

  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info('Manual speed test triggered', { user: session.user?.email });

    const speedTester = new SpeedTester();
    const result = await speedTester.runSpeedTest();

    const duration = Date.now() - startTime;
    await logger.logRequest('POST', '/api/speedtest/run', 200, duration);

    if (!result) {
      return NextResponse.json(
        { error: 'Speed test failed to complete' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
      message: 'Speed test completed successfully',
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    await logger.error('Failed to run manual speed test', {
      error: error instanceof Error ? error.message : String(error),
    });
    await logger.logRequest('POST', '/api/speedtest/run', 500, duration);

    return NextResponse.json(
      { error: 'Failed to run speed test' },
      { status: 500 }
    );
  }
}
