import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { safePing, isValidIPv4 } from '@/lib/utils/shell';

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

    // Validate format using proper IP validation (checks 0-255 octets)
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    // Detect malformed IP addresses (all digits and dots but wrong format)
    const looksLikeMalformedIP = /^[\d.]+$/.test(target) && !isValidIPv4(target);

    const isValidIP = isValidIPv4(target);
    const isValidDomain = !isValidIP && !looksLikeMalformedIP && domainRegex.test(target);

    if (looksLikeMalformedIP) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid IP address format. Must have exactly 4 octets (0-255) separated by dots.',
        },
        { status: 400 }
      );
    }

    if (!isValidIP && !isValidDomain) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid target format. Must be a valid IP address or domain name.',
        },
        { status: 400 }
      );
    }

    // Attempt to ping the target using safe ping (prevents command injection)
    try {
      const { stdout } = await safePing(target);

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
