import { auth } from "@/lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnDashboard = req.nextUrl.pathname.startsWith('/dashboard');
  const isOnLogin = req.nextUrl.pathname.startsWith('/login');
  const isOnApi = req.nextUrl.pathname.startsWith('/api');

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

  // API routes handle their own auth
  if (isOnApi) {
    return;
  }
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
