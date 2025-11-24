import { NextRequest, NextResponse } from 'next/server';
import { Session } from 'next-auth';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/utils';

type RouteContext = { params: Promise<Record<string, string>> };

/**
 * Handler function that receives the authenticated session
 */
type AuthenticatedHandler<T = unknown> = (
  request: NextRequest,
  session: Session,
  context?: RouteContext
) => Promise<NextResponse<T>>;

/**
 * Handler function for routes that don't need request object
 */
type AuthenticatedGetHandler<T = unknown> = (
  session: Session
) => Promise<NextResponse<T>>;

interface WithAuthOptions {
  /** API route path for logging (e.g., '/api/stats') */
  route: string;
  /** HTTP method for logging */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
}

/**
 * Wraps an API route handler with authentication and error handling
 *
 * Usage:
 * ```ts
 * export const GET = withAuth(
 *   async (session) => {
 *     const data = await fetchData();
 *     return NextResponse.json(data);
 *   },
 *   { route: '/api/example', method: 'GET' }
 * );
 * ```
 */
export function withAuth<T = unknown>(
  handler: AuthenticatedGetHandler<T>,
  options: WithAuthOptions
): () => Promise<NextResponse<T | { error: string }>> {
  return async () => {
    const startTime = Date.now();

    const session = await auth();
    if (!session?.user) {
      const duration = Date.now() - startTime;
      await logger.logRequest(options.method, options.route, 401, duration, {
        reason: 'Unauthorized - no session',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const response = await handler(session);
      const duration = Date.now() - startTime;
      await logger.logRequest(options.method, options.route, 200, duration, {
        userId: session.user.email ?? undefined,
      });
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = getErrorMessage(error);

      await logger.error(`${options.method} ${options.route} failed`, {
        error: errorMessage,
        userId: session.user.email ?? undefined,
      });
      await logger.logRequest(options.method, options.route, 500, duration, {
        error: errorMessage,
        userId: session.user.email ?? undefined,
      });

      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Wraps an API route handler with authentication and error handling
 * Use this version when you need access to the request object
 *
 * Usage:
 * ```ts
 * export const POST = withAuthRequest(
 *   async (request, session) => {
 *     const body = await request.json();
 *     // ... process body
 *     return NextResponse.json({ success: true });
 *   },
 *   { route: '/api/example', method: 'POST' }
 * );
 * ```
 */
export function withAuthRequest<T = unknown>(
  handler: AuthenticatedHandler<T>,
  options: WithAuthOptions
): (request: NextRequest, context?: RouteContext) => Promise<NextResponse<T | { error: string }>> {
  return async (request: NextRequest, context?: RouteContext) => {
    const startTime = Date.now();

    const session = await auth();
    if (!session?.user) {
      const duration = Date.now() - startTime;
      await logger.logRequest(options.method, options.route, 401, duration, {
        reason: 'Unauthorized - no session',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const response = await handler(request, session, context);
      const duration = Date.now() - startTime;
      await logger.logRequest(options.method, options.route, 200, duration, {
        userId: session.user.email ?? undefined,
      });
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = getErrorMessage(error);

      await logger.error(`${options.method} ${options.route} failed`, {
        error: errorMessage,
        userId: session.user.email ?? undefined,
      });
      await logger.logRequest(options.method, options.route, 500, duration, {
        error: errorMessage,
        userId: session.user.email ?? undefined,
      });

      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Standard success response helper
 */
export function successResponse<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

/**
 * Standard error response helper
 */
export function errorResponse(
  message: string,
  status = 500
): NextResponse<{ error: string }> {
  return NextResponse.json({ error: message }, { status });
}
