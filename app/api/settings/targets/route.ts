import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/utils';
import { z } from 'zod';

const TargetSchema = z.object({
  target: z.string().min(1, 'Target is required'),
  displayName: z.string().min(1, 'Display name is required'),
  type: z.enum(['dns', 'domain', 'ip']),
  priority: z.number().int().min(1).default(100),
  isEnabled: z.boolean().default(true),
});

const UpdateTargetSchema = TargetSchema.partial();

/**
 * GET /api/settings/targets
 * List all monitoring targets
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const targets = await prisma.monitoringTarget.findMany({
      orderBy: { priority: 'asc' },
    });

    return NextResponse.json({ targets });
  } catch (error) {
    await logger.error('Failed to fetch monitoring targets', { error: getErrorMessage(error) });
    return NextResponse.json(
      { error: 'Failed to fetch targets' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/targets
 * Create a new monitoring target
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = TargetSchema.parse(body);

    // Check for duplicate target
    const existing = await prisma.monitoringTarget.findUnique({
      where: { target: validatedData.target },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Target already exists' },
        { status: 400 }
      );
    }

    const newTarget = await prisma.monitoringTarget.create({
      data: validatedData,
    });

    // Log the addition
    await logger.logSettings('target_added', validatedData.displayName, {
      target: validatedData.target,
      type: validatedData.type,
      userEmail: session.user.email,
    });

    return NextResponse.json({ target: newTarget }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    await logger.error('Failed to create monitoring target', { error: getErrorMessage(error) });
    return NextResponse.json(
      { error: 'Failed to create target' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/targets
 * Update a monitoring target
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id || typeof id !== 'number') {
      return NextResponse.json({ error: 'Invalid target ID' }, { status: 400 });
    }

    const validatedUpdates = UpdateTargetSchema.parse(updates);

    // Get existing target for logging
    const existingTarget = await prisma.monitoringTarget.findUnique({
      where: { id },
    });

    if (!existingTarget) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }

    // If changing target value, check for duplicates
    if (validatedUpdates.target && validatedUpdates.target !== existingTarget.target) {
      const duplicate = await prisma.monitoringTarget.findUnique({
        where: { target: validatedUpdates.target },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: 'Target already exists' },
          { status: 400 }
        );
      }
    }

    const updatedTarget = await prisma.monitoringTarget.update({
      where: { id },
      data: validatedUpdates,
    });

    // Log the update
    const action =
      validatedUpdates.isEnabled !== undefined && validatedUpdates.isEnabled !== existingTarget.isEnabled
        ? validatedUpdates.isEnabled ? 'target_enabled' : 'target_disabled'
        : 'target_updated';

    await logger.logSettings(action, existingTarget.displayName, {
      targetId: id,
      changes: validatedUpdates,
      userEmail: session.user.email,
    });

    return NextResponse.json({ target: updatedTarget });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    await logger.error('Failed to update monitoring target', { error: getErrorMessage(error) });
    return NextResponse.json(
      { error: 'Failed to update target' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/targets?id=123
 * Delete a monitoring target
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');

    if (!idParam) {
      return NextResponse.json({ error: 'Target ID is required' }, { status: 400 });
    }

    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid target ID' }, { status: 400 });
    }

    // Prevent deletion if it's the last enabled target
    const enabledCount = await prisma.monitoringTarget.count({
      where: { isEnabled: true },
    });

    const target = await prisma.monitoringTarget.findUnique({
      where: { id },
    });

    if (!target) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }

    if (target.isEnabled && enabledCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last enabled target. Disable it instead or add another target first.' },
        { status: 400 }
      );
    }

    await prisma.monitoringTarget.delete({
      where: { id },
    });

    // Log the deletion
    await logger.logSettings('target_deleted', target.displayName, {
      targetId: id,
      target: target.target,
      userEmail: session.user.email,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    await logger.error('Failed to delete monitoring target', { error: getErrorMessage(error) });
    return NextResponse.json(
      { error: 'Failed to delete target' },
      { status: 500 }
    );
  }
}
