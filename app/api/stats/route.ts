import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Stats } from '@/types/dashboard';
import { logger } from '@/lib/logger';

export async function GET() {
  const startTime = Date.now();
  const session = await auth();

  if (!session) {
    const duration = Date.now() - startTime;
    await logger.logRequest('GET', '/api/stats', 401, duration, {
      reason: 'Unauthorized - no session'
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [
      totalOutages,
      activeOutage,
      outageHistory,
      latestSpeedTest
    ] = await Promise.all([
      prisma.outage.count({ where: { isResolved: true } }),
      prisma.outage.findFirst({ where: { isResolved: false } }),
      prisma.outage.findMany({
        take: 50,
        orderBy: { startTime: 'desc' },
        where: { isResolved: true }
      }),
      prisma.speedTest.findFirst({
        orderBy: { timestamp: 'desc' },
        select: {
          downloadMbps: true,
          uploadMbps: true,
          pingMs: true,
          timestamp: true
        }
      })
    ]);

    const totalDowntime = await prisma.outage.aggregate({
      where: { isResolved: true },
      _sum: { durationSec: true }
    });

    const avgOutageDuration = outageHistory.length > 0
      ? (totalDowntime._sum.durationSec || 0) / outageHistory.length
      : 0;

    const response: Stats = {
      totalOutages,
      activeOutage,
      totalDowntimeSec: totalDowntime._sum.durationSec || 0,
      avgOutageDurationSec: Math.round(avgOutageDuration),
      // Chart data is now served by /api/stats/chart-data endpoint
      // Keep empty array for backward compatibility
      recentChecks: [],
      outageHistory: outageHistory.map(outage => ({
        id: outage.id,
        startTime: outage.startTime,
        endTime: outage.endTime,
        durationSec: outage.durationSec,
        isResolved: outage.isResolved,
        checksCount: outage.checksCount,
        emailSent: outage.emailSent
      })),
      latestSpeedTest: latestSpeedTest ? {
        downloadMbps: latestSpeedTest.downloadMbps,
        uploadMbps: latestSpeedTest.uploadMbps,
        pingMs: latestSpeedTest.pingMs,
        timestamp: latestSpeedTest.timestamp
      } : null
    };

    const duration = Date.now() - startTime;
    await logger.logRequest('GET', '/api/stats', 200, duration, {
      userId: session.user?.email ?? undefined,
      totalOutages
    });

    return NextResponse.json(
      response,
      {
        headers: {
          // Cache for 30 seconds, allow stale data for 60 seconds while revalidating
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    await logger.logRequest('GET', '/api/stats', 500, duration, {
      error: errorMessage,
      userId: session.user?.email ?? undefined
    });

    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}

// Force dynamic rendering - this endpoint always needs fresh data
export const dynamic = 'force-dynamic';
