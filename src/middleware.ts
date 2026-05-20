import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@libs/session';

export default async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  console.log('--->', path);

  const session = await getSession();

  if (path.includes('/user/sign') || path === '/') {
    return NextResponse.next();
  }

  if (!session || !session?.userId) {
    return NextResponse.redirect(new URL('/user/sign', req.nextUrl));
  }

  return NextResponse.next();
}

// Routes Middleware should not run on
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};
