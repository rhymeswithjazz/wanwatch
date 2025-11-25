import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { isValidIPv4 } from '@/lib/utils/shell';
import { withAuth, withAuthRequest } from '@/lib/api-utils';

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
export const GET = withAuth(
  async () => {
    const targets = await prisma.monitoringTarget.findMany({
      orderBy: { priority: 'asc' },
    });

    return NextResponse.json({ targets });
  },
  { route: '/api/settings/targets', method: 'GET' }
);

/**
 * POST /api/settings/targets
 * Create a new monitoring target
 */
export const POST = withAuthRequest(
  async (request: NextRequest, session) => {
    const body = await request.json();

    let validatedData: z.infer<typeof TargetSchema>;
    try {
      validatedData = TargetSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid input', details: error.issues },
          { status: 400 }
        );
      }
      throw error;
    }

    // Validate target format
    const target = validatedData.target;
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    const looksLikeMalformedIP = /^[\d.]+$/.test(target) && !isValidIPv4(target);
    const isValidIP = isValidIPv4(target);
    const isValidDomain = !isValidIP && !looksLikeMalformedIP && domainRegex.test(target);

    if (looksLikeMalformedIP) {
      return NextResponse.json(
        { error: 'Invalid IP address format. Must have exactly 4 octets (0-255) separated by dots.' },
        { status: 400 }
      );
    }

    if (!isValidIP && !isValidDomain) {
      return NextResponse.json(
        { error: 'Invalid target format. Must be a valid IP address or domain name.' },
        { status: 400 }
      );
    }

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
      userEmail: session.user?.email,
    });

    return NextResponse.json({ target: newTarget }, { status: 201 });
  },
  { route: '/api/settings/targets', method: 'POST' }
);

/**
 * PUT /api/settings/targets
 * Update a monitoring target
 */
export const PUT = withAuthRequest(
  async (request: NextRequest, session) => {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id || typeof id !== 'number') {
      return NextResponse.json({ error: 'Invalid target ID' }, { status: 400 });
    }

    let validatedUpdates: z.infer<typeof UpdateTargetSchema>;
    try {
      validatedUpdates = UpdateTargetSchema.parse(updates);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid input', details: error.issues },
          { status: 400 }
        );
      }
      throw error;
    }

    // Validate target format if being updated
    if (validatedUpdates.target) {
      const target = validatedUpdates.target;
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      const looksLikeMalformedIP = /^[\d.]+$/.test(target) && !isValidIPv4(target);
      const isValidIP = isValidIPv4(target);
      const isValidDomain = !isValidIP && !looksLikeMalformedIP && domainRegex.test(target);

      if (looksLikeMalformedIP) {
        return NextResponse.json(
          { error: 'Invalid IP address format. Must have exactly 4 octets (0-255) separated by dots.' },
          { status: 400 }
        );
      }

      if (!isValidIP && !isValidDomain) {
        return NextResponse.json(
          { error: 'Invalid target format. Must be a valid IP address or domain name.' },
          { status: 400 }
        );
      }
    }

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
      userEmail: session.user?.email,
    });

    return NextResponse.json({ target: updatedTarget });
  },
  { route: '/api/settings/targets', method: 'PUT' }
);

/**
 * DELETE /api/settings/targets?id=123
 * Delete a monitoring target
 */
export const DELETE = withAuthRequest(
  async (request: NextRequest, session) => {
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
      userEmail: session.user?.email,
    });

    return NextResponse.json({ success: true });
  },
  { route: '/api/settings/targets', method: 'DELETE' }
);
