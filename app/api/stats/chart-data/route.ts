import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { TimePeriod, ChartDataPoint } from '@/types/dashboard';
import { withAuthRequest } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

/**
 * Maximum number of connection checks to fetch from database
 */
const MAX_POINTS = 50000;

/**
 * Calculate cutoff time based on the selected time period
 */
function getCutoffTime(period: TimePeriod): Date {
  const now = new Date();
  const cutoff = new Date();

  switch (period) {
    case '5m':
      cutoff.setMinutes(now.getMinutes() - 5);
      break;
    case '15m':
      cutoff.setMinutes(now.getMinutes() - 15);
      break;
    case '1h':
      cutoff.setHours(now.getHours() - 1);
      break;
    case '6h':
      cutoff.setHours(now.getHours() - 6);
      break;
    case '24h':
      cutoff.setHours(now.getHours() - 24);
      break;
    case 'all':
      cutoff.setFullYear(2000);
      break;
  }

  return cutoff;
}

/**
 * Get target number of data points for each time period
 */
function getTargetBuckets(period: TimePeriod): number {
  switch (period) {
    case '5m':
      return 10;
    case '15m':
      return 30;
    case '1h':
      return 60;
    case '6h':
      return 72;
    case '24h':
      return 96;
    case 'all':
      return 200;
  }
}

/**
 * Server-side downsampling of connection check data
 */
function downsampleData(
  data: Array<{ timestamp: Date; isConnected: boolean }>,
  maxPoints: number
): ChartDataPoint[] {
  if (data.length === 0) {
    return [];
  }

  if (data.length <= maxPoints) {
    return data.map((check, index) => ({
      timestamp: check.timestamp,
      isConnected: check.isConnected,
      bucket: index,
    }));
  }

  const bucketSize = Math.max(1, Math.ceil(data.length / maxPoints));
  const downsampled: ChartDataPoint[] = [];

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, i + bucketSize);
    const hasDisconnection = bucket.some(check => !check.isConnected);
    const representative = bucket[Math.floor(bucket.length / 2)];

    if (!representative) {
      continue;
    }

    downsampled.push({
      timestamp: representative.timestamp,
      isConnected: !hasDisconnection,
      bucket: Math.floor(i / bucketSize),
    });
  }

  return downsampled;
}

export const GET = withAuthRequest(
  async (request: NextRequest, session) => {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') || '24h') as TimePeriod;

    const validPeriods: TimePeriod[] = ['5m', '15m', '1h', '6h', '24h', 'all'];
    if (!validPeriods.includes(period)) {
      return NextResponse.json(
        { error: 'Invalid period. Must be one of: 5m, 15m, 1h, 6h, 24h, all' },
        { status: 400 }
      );
    }

    const cutoffTime = getCutoffTime(period);
    const targetBuckets = getTargetBuckets(period);

    const checks = await prisma.connectionCheck.findMany({
      where: {
        timestamp: { gte: cutoffTime }
      },
      orderBy: { timestamp: 'asc' },
      take: MAX_POINTS,
      select: {
        timestamp: true,
        isConnected: true,
      }
    });

    if (checks.length === MAX_POINTS) {
      await logger.warn('Chart data query hit MAX_POINTS limit - data truncated', {
        period,
        cutoffTime: cutoffTime.toISOString(),
        maxPoints: MAX_POINTS,
        userId: session.user?.email ?? undefined
      });
    }

    const chartData = downsampleData(checks, targetBuckets);

    return NextResponse.json(
      { chartData },
      {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      }
    );
  },
  { route: '/api/stats/chart-data', method: 'GET' }
);

export const dynamic = 'force-dynamic';
