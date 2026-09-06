import { precomputeFlags } from '@/lib/flags';
import { getSessionCookie } from 'better-auth/cookies';
import { precompute } from 'flags/next';
import { NextRequest, NextResponse } from 'next/server';

// Define the list of public paths
const publicPaths = ['/', '/api', '/signin', '/signup'];

export async function middleware(request: NextRequest) {
  // Get the pathname
  const path = request.nextUrl.pathname;

  // Skip middleware processing for Next.js internal routes and static assets
  if (
    path.startsWith('/_next') ||
    path.startsWith('/api/auth') ||
    path.includes('.') ||
    path.startsWith('/static') ||
    path.startsWith('/home')
  ) {
    return NextResponse.next();
  }

  if (path.startsWith('/dev') && process.env.NODE_ENV !== 'development') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  try {
    // Check for session cookie existence (much more efficient than API calls)
    const sessionCookie = getSessionCookie(request);

    // Redirect authenticated users from public pages to dashboard
    if (sessionCookie && publicPaths.some((publicPath) => path === publicPath)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Protect dashboard and other authenticated routes
    if (
      !sessionCookie &&
      !publicPaths.some((publicPath) => path === publicPath || path.startsWith(`${publicPath}/`))
    ) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    // In case of error, allow the request to proceed and let page-level auth handle it
  }

  if (path === '/') {
    const code = await precompute(precomputeFlags);
    // const nextUrl = new URL(`/landing/${code}/${request.nextUrl.search}`, request.url);
    const nextUrl = new URL(`/home/${code}/${request.nextUrl.search}`, request.url);

    return NextResponse.rewrite(nextUrl, { request });
  }

  return NextResponse.next();
}

// Specify the paths this middleware should run on
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
