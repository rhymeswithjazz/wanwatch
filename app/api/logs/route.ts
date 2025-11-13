import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface LogEntry {
  id: number;
  timestamp: Date;
  level: string;
  message: string;
  metadata: string | null;
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const session = await auth();

  if (!session) {
    const duration = Date.now() - startTime;
    await logger.logRequest('GET', '/api/logs', 401, duration, {
      reason: 'Unauthorized - no session'
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const level = searchParams.get('level') || undefined;
    const search = searchParams.get('search') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    // Build where clause
    const where: {
      level?: string;
      message?: { contains: string };
      timestamp?: { gte?: Date; lte?: Date };
    } = {};

    if (level && level !== 'all') {
      where.level = level;
    }

    if (search) {
      where.message = { contains: search };
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate);
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate);
      }
    }

    // Get total count for pagination
    const total = await prisma.systemLog.count({ where });

    // Fetch logs with pagination
    const logs = await prisma.systemLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const response: LogsResponse = {
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    logger.debug('Logs fetched', {
      userId: session.user?.email ?? undefined,
      page,
      pageSize,
      total,
      filters: { level, search, startDate, endDate }
    });

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    await logger.logRequest('GET', '/api/logs', 500, duration, {
      error: errorMessage,
      userId: session.user?.email ?? undefined
    });

    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
