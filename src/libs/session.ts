import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const expireDays = 365;

interface SessionPayload {
  userId: string;
  expiresAt: Date;
  [key: string]: any;
}

const secretKey = process.env.SESSION_SECRET;
const encodedKey = new TextEncoder().encode(secretKey);

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expireDays}d`)
    .sign(encodedKey);
}

export async function decrypt(session: string | undefined = '') {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ['HS256'],
    });
    return payload as SessionPayload;
  } catch {
    console.log('Failed to verify session');
  }
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000);
  const session = await encrypt({ userId, expiresAt });
  const cookieStore = await cookies();

  cookieStore.set('session', session, {
    httpOnly: true,
    secure: true,
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  });
}

export async function getSession() {
  const cookie = (await cookies()).get('session')?.value;
  const session = await decrypt(cookie);
  return session;
}

export async function getUID() {
  const userId = (await getSession())?.userId;

  return userId ? Number(userId) : null;
}
