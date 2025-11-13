import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Stats } from '@/types/dashboard';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [
      totalOutages,
      activeOutage,
      recentChecks,
      outageHistory
    ] = await Promise.all([
      prisma.outage.count({ where: { isResolved: true } }),
      prisma.outage.findFirst({ where: { isResolved: false } }),
      prisma.connectionCheck.findMany({
        take: 50000,
        orderBy: { timestamp: 'desc' }
      }),
      prisma.outage.findMany({
        take: 50,
        orderBy: { startTime: 'desc' },
        where: { isResolved: true }
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
      recentChecks: recentChecks.map(check => ({
        id: check.id,
        timestamp: check.timestamp,
        isConnected: check.isConnected,
        latencyMs: check.latencyMs,
        target: check.target
      })),
      outageHistory: outageHistory.map(outage => ({
        id: outage.id,
        startTime: outage.startTime,
        endTime: outage.endTime,
        durationSec: outage.durationSec,
        isResolved: outage.isResolved,
        checksCount: outage.checksCount,
        emailSent: outage.emailSent
      }))
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching stats:', errorMessage);

    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
