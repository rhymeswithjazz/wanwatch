import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/api-utils';

export const GET = withAuth(
  async () => {
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

    return NextResponse.json({
      latest,
      history,
      averages: {
        downloadMbps: avgDownload,
        uploadMbps: avgUpload,
        pingMs: avgPing,
      },
    });
  },
  { route: '/api/speedtest', method: 'GET' }
);
