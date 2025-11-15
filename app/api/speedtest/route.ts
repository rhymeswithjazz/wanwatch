import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
  const startTime = Date.now();

  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get latest speed test
    const latest = await prisma.speedTest.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    // Get speed test history (last 100 tests)
    const history = await prisma.speedTest.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
      select: {
        id: true,
        timestamp: true,
        downloadMbps: true,
        uploadMbps: true,
        pingMs: true,
        jitterMs: true,
        serverName: true,
        serverCountry: true,
      },
    });

    // Calculate averages
    let avgDownload = 0;
    let avgUpload = 0;
    let avgPing = 0;

    if (history.length > 0) {
      avgDownload = history.reduce((sum, test) => sum + test.downloadMbps, 0) / history.length;
      avgUpload = history.reduce((sum, test) => sum + test.uploadMbps, 0) / history.length;
      avgPing = history.reduce((sum, test) => sum + test.pingMs, 0) / history.length;
    }

    const duration = Date.now() - startTime;
    await logger.logRequest('GET', '/api/speedtest', 200, duration);

    return NextResponse.json({
      latest,
      history,
      averages: {
        downloadMbps: avgDownload,
        uploadMbps: avgUpload,
        pingMs: avgPing,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    await logger.error('Failed to fetch speed test data', {
      error: error instanceof Error ? error.message : String(error),
    });
    await logger.logRequest('GET', '/api/speedtest', 500, duration);

    return NextResponse.json(
      { error: 'Failed to fetch speed test data' },
      { status: 500 }
    );
  }
}
