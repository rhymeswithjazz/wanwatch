import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  return NextResponse.json({
    totalOutages,
    activeOutage,
    totalDowntimeSec: totalDowntime._sum.durationSec || 0,
    avgOutageDurationSec: Math.round(avgOutageDuration),
    recentChecks: recentChecks.map(check => ({
      timestamp: check.timestamp,
      isConnected: check.isConnected,
      latencyMs: check.latencyMs
    })),
    outageHistory: outageHistory.map(outage => ({
      startTime: outage.startTime,
      endTime: outage.endTime,
      durationSec: outage.durationSec
    }))
  });
}
