import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

// Use lightweight auth config for middleware (no database access)
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnDashboard = req.nextUrl.pathname.startsWith('/dashboard');
  const isOnLogin = req.nextUrl.pathname.startsWith('/login');

  // Protect dashboard - redirect to login if not authenticated
  if (!isLoggedIn && isOnDashboard) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return Response.redirect(loginUrl);
  }

  // Redirect to dashboard if already logged in and trying to access login
  if (isLoggedIn && isOnLogin) {
    return Response.redirect(new URL('/dashboard', req.nextUrl.origin));
  }

  // Allow request to proceed (API routes handle their own auth)
  return;
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
