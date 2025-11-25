import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuthRequest } from '@/lib/api-utils';

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

export const GET = withAuthRequest(
  async (request: NextRequest) => {
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

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  },
  { route: '/api/logs', method: 'GET' }
);

export const dynamic = 'force-dynamic';
