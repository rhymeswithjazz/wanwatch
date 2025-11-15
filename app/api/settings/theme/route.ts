import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

const VALID_THEMES = ['default', 'network-pulse', 'signal', 'monitor'];

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { themeVariant: true }
    });

    return NextResponse.json({
      themeVariant: user?.themeVariant || 'default'
    });
  } catch (error) {
    await logger.error('Error fetching theme preference', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return NextResponse.json(
      { error: 'Failed to fetch theme preference' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { themeVariant } = body;

    if (!themeVariant || !VALID_THEMES.includes(themeVariant)) {
      return NextResponse.json(
        { error: 'Invalid theme variant' },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { email: session.user.email },
      data: { themeVariant }
    });

    await logger.info('Theme preference updated', {
      email: session.user.email,
      themeVariant
    });

    return NextResponse.json({
      success: true,
      themeVariant
    });
  } catch (error) {
    await logger.error('Error updating theme preference', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return NextResponse.json(
      { error: 'Failed to update theme preference' },
      { status: 500 }
    );
  }
}
