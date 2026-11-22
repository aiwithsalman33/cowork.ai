import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'cowork-ai';
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AccessClaims {
  sub: string;
  role: 'USER' | 'ADMIN';
  /** id of the admin who is impersonating this user, if any */
  imp?: string;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const jwt = new SignJWT({ role: claims.role, ...(claims.imp ? { imp: claims.imp } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`);
  return jwt.sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') return null;
    const role = payload.role === 'ADMIN' ? 'ADMIN' : 'USER';
    return { sub: payload.sub, role, ...(typeof payload.imp === 'string' ? { imp: payload.imp } : {}) };
  } catch {
    return null;
  }
}
