import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@libs/session';

// 1. Specify protected and public routes
// const protectedRoutes = ['/dashboard']
// const publicRoutes = ['/login', '/signup', '/']

export default async function middleware(req: NextRequest) {
  // 2. Check if the current route is protected or public
  const path = req.nextUrl.pathname;
  // const isProtectedRoute = true;
  //   const isProtectedRoute = protectedRoutes.includes(path)
  //   const isPublicRoute = publicRoutes.includes(path)

  // 3. Decrypt the session from the cookie
  const session = await getSession();

  if (path.includes('/user/sign') || path === '/') {
    return NextResponse.next();
  }

  // 4. Redirect to /login if the user is not authenticated
  if (!session || !session?.userId) {
    return NextResponse.redirect(new URL('/user/sign', req.nextUrl));
  }
  // console.log('session', session);

  // 5. Redirect to /dashboard if the user is authenticated
  //   if (
  //     isPublicRoute &&
  //     session?.userId &&
  //     !req.nextUrl.pathname.startsWith('/dashboard')
  //   ) {
  //     return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  //   }
  return NextResponse.next();
}

// Routes Middleware should not run on
export const config = {
  matcher: ['/((?!api|ai-hub|_next/static|_next/image|.*\\.png$).*)'],
};
