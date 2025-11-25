import { NextResponse } from 'next/server';
import { SpeedTester } from '@/lib/monitoring/speed-tester';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/api-utils';

// In-memory rate limiter - tracks last test time per user
const lastTestTime = new Map<string, number>();
const COOLDOWN_MS = 60000; // 1 minute cooldown between manual tests
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Clean up every hour
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // Remove entries older than 24 hours

// Periodic cleanup to prevent memory leak from growing Map
// Only runs in Node.js environment (not during build)
if (typeof setInterval !== 'undefined' && typeof process !== 'undefined') {
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [user, time] of lastTestTime) {
      if (now - time > STALE_THRESHOLD_MS) {
        lastTestTime.delete(user);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Don't prevent process from exiting
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

export const POST = withAuth(
  async (session) => {
    // Rate limiting check
    const userId = session.user!.email!;
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
  },
  { route: '/api/speedtest/run', method: 'POST' }
);
