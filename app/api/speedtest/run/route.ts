import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { SpeedTester } from '@/lib/monitoring/speed-tester';
import { logger } from '@/lib/logger';

// In-memory rate limiter - tracks last test time per user
const lastTestTime = new Map<string, number>();
const COOLDOWN_MS = 60000; // 1 minute cooldown between manual tests

export async function POST() {
  const startTime = Date.now();

  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting check
    const userId = session.user.email;
    const now = Date.now();
    const lastTest = lastTestTime.get(userId);

    if (lastTest && now - lastTest < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastTest)) / 1000);

      await logger.warn('Rate limit hit for manual speed test', {
        user: userId,
        remainingSeconds
      });

      return NextResponse.json(
        {
          error: `Please wait ${remainingSeconds} seconds before running another speed test`,
          remainingSeconds
        },
        { status: 429 }
      );
    }

    logger.info('Manual speed test triggered', { user: userId });

    // Record test time before running (prevents rapid double-clicks)
    lastTestTime.set(userId, now);

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
