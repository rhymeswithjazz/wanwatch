import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';

const execAsync = promisify(exec);

const ValidateSchema = z.object({
  target: z.string().min(1, 'Target is required'),
});

/**
 * POST /api/settings/targets/validate
 * Validate a target by attempting to ping it
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { target } = ValidateSchema.parse(body);

    // Validate format (basic check for DNS/IP)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    const isValidIP = ipRegex.test(target);
    const isValidDomain = domainRegex.test(target);

    if (!isValidIP && !isValidDomain) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid target format. Must be a valid IP address or domain name.',
        },
        { status: 400 }
      );
    }

    // Attempt to ping the target
    try {
      const { stdout } = await execAsync(`ping -c 1 -W 5 ${target}`);

      // Parse latency from ping output
      const match = stdout.match(/time=(\d+\.?\d*)/);
      const latencyMs = match?.[1] ? parseFloat(match[1]) : null;

      // Determine type
      const type = isValidIP ? 'ip' : 'domain';

      return NextResponse.json({
        valid: true,
        reachable: true,
        latencyMs,
        suggestedType: type,
      });
    } catch (pingError) {
      // Target format is valid but unreachable
      return NextResponse.json({
        valid: true,
        reachable: false,
        warning: 'Target is not currently reachable via ping. You can still add it.',
        suggestedType: isValidIP ? 'ip' : 'domain',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Validation failed' },
      { status: 500 }
    );
  }
}
