import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Stats } from '@/types/dashboard';
import { withAuth } from '@/lib/api-utils';

export const GET = withAuth(
  async () => {
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

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    });
  },
  { route: '/api/stats', method: 'GET' }
);

export const dynamic = 'force-dynamic';
