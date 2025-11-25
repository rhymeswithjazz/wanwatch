import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, withAuthRequest } from '@/lib/api-utils';

const VALID_THEMES = ['default', 'network-pulse', 'signal', 'monitor', 'dracula'];

export const GET = withAuth(
  async (session) => {
    const user = await prisma.user.findUnique({
      where: { email: session.user!.email! },
      select: { themeVariant: true }
    });

    return NextResponse.json({
      themeVariant: user?.themeVariant || 'default'
    });
  },
  { route: '/api/settings/theme', method: 'GET' }
);

export const POST = withAuthRequest(
  async (request: NextRequest, session) => {
    const body = await request.json();
    const { themeVariant } = body;

    if (!themeVariant || !VALID_THEMES.includes(themeVariant)) {
      return NextResponse.json(
        { error: 'Invalid theme variant' },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { email: session.user!.email! },
      data: { themeVariant }
    });

    await logger.info('Theme preference updated', {
      email: session.user!.email,
      themeVariant
    });

    return NextResponse.json({
      success: true,
      themeVariant
    });
  },
  { route: '/api/settings/theme', method: 'POST' }
);
