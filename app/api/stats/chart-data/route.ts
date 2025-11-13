import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TimePeriod, ChartDataPoint } from '@/types/dashboard';

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
      // Get all data - set cutoff to a very old date
      cutoff.setFullYear(2000);
      break;
  }

  return cutoff;
}

/**
 * Get target number of data points for each time period
 * This ensures consistent chart appearance without overwhelming the browser
 */
function getTargetBuckets(period: TimePeriod): number {
  switch (period) {
    case '5m':
      return 10;   // 10 bars (every 30s for 5 min)
    case '15m':
      return 30;   // 30 bars (every 30s for 15 min)
    case '1h':
      return 60;   // 60 bars (aggregate every 2 checks = 1 min per bar)
    case '6h':
      return 72;   // 72 bars (aggregate every 10 checks = 5 min per bar)
    case '24h':
      return 96;   // 96 bars (aggregate every 30 checks = 15 min per bar)
    case 'all':
      return 200;  // Max 200 bars for full history
  }
}

/**
 * Server-side downsampling of connection check data
 *
 * IMPORTANT: This function preserves outage visibility by checking if ANY
 * check in a bucket was disconnected. This ensures no data loss for monitoring.
 *
 * @param data - Array of connection checks from database
 * @param maxPoints - Maximum number of data points to return
 * @returns Downsampled array with outages preserved
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

    // CRITICAL: If ANY check in this bucket is disconnected, show as disconnected
    // This ensures outages are always visible in the chart
    const hasDisconnection = bucket.some(check => !check.isConnected);

    // Use the middle item from the bucket as representative timestamp
    const representative = bucket[Math.floor(bucket.length / 2)];

    downsampled.push({
      timestamp: representative.timestamp,
      isConnected: !hasDisconnection, // Show red if any disconnection in bucket
      bucket: Math.floor(i / bucketSize),
    });
  }

  return downsampled;
}

/**
 * GET /api/stats/chart-data
 *
 * Returns aggregated connection check data for the timeline chart
 * Performs server-side filtering and downsampling to reduce bandwidth
 *
 * Query params:
 * - period: TimePeriod ('5m' | '15m' | '1h' | '6h' | '24h' | 'all')
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') || '24h') as TimePeriod;

    // Validate period
    const validPeriods: TimePeriod[] = ['5m', '15m', '1h', '6h', '24h', 'all'];
    if (!validPeriods.includes(period)) {
      return NextResponse.json(
        { error: 'Invalid period. Must be one of: 5m, 15m, 1h, 6h, 24h, all' },
        { status: 400 }
      );
    }

    const cutoffTime = getCutoffTime(period);
    const targetBuckets = getTargetBuckets(period);

    // Fetch only relevant data from database
    // Only select the fields we need for charting (timestamp, isConnected)
    const checks = await prisma.connectionCheck.findMany({
      where: {
        timestamp: { gte: cutoffTime }
      },
      orderBy: { timestamp: 'asc' },
      select: {
        timestamp: true,
        isConnected: true,
      }
    });

    // Perform server-side downsampling
    const chartData = downsampleData(checks, targetBuckets);

    return NextResponse.json(
      { chartData },
      {
        headers: {
          // Cache for 10 seconds, allow stale data for 30 seconds while revalidating
          'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
        },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching chart data:', errorMessage);

    return NextResponse.json(
      { error: 'Failed to fetch chart data' },
      { status: 500 }
    );
  }
}

// Force dynamic rendering - this endpoint always needs fresh data
export const dynamic = 'force-dynamic';
