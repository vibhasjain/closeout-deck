import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import type { JWTVerifyGetKey } from 'jose'

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
export const SESSION_SECONDS = 30 * 24 * 60 * 60

export interface User {
  sub: string
  email: string
  name: string
  picture: string
}

export interface Session {
  sessionToken: string
  exp: number
  email: string
  name: string
  picture: string
}

export class AuthError extends Error {
  constructor() {
    super('invalid_token')
  }
}

export function isAllowedEmail(email: string, domains: string): boolean {
  const separator = email.lastIndexOf('@')
  if (separator < 1) return false
  const domain = email.slice(separator + 1).toLowerCase()
  return domains.split(',').map(value => value.trim().toLowerCase()).filter(Boolean).includes(domain)
}

export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  keys: JWTVerifyGetKey = googleKeys,
): Promise<User> {
  if (!token || !clientId) throw new AuthError()
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
      audience: clientId,
      requiredClaims: ['sub', 'email', 'exp'],
    })
    if (payload.email_verified !== true || typeof payload.email !== 'string' || !payload.sub) {
      throw new AuthError()
    }
    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: typeof payload.name === 'string' ? payload.name : '',
      picture: typeof payload.picture === 'string' ? payload.picture : '',
    }
  } catch {
    throw new AuthError()
  }
}

function signingKey(secret: string): Uint8Array {
  if (!secret) throw new AuthError()
  return new TextEncoder().encode(secret)
}

export async function signSession(user: User, secret: string, now = new Date()): Promise<Session> {
  const issuedAt = Math.floor(now.getTime() / 1000)
  const exp = issuedAt + SESSION_SECONDS
  const sessionToken = await new SignJWT({ email: user.email, name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.sub)
    .setIssuedAt(issuedAt)
    .setExpirationTime(exp)
    .sign(signingKey(secret))
  return { sessionToken, exp, email: user.email, name: user.name, picture: user.picture }
}

export async function verifySession(token: string, secret: string, now = new Date()): Promise<User> {
  try {
    const { payload } = await jwtVerify(token, signingKey(secret), {
      algorithms: ['HS256'],
      requiredClaims: ['sub', 'email', 'name', 'picture', 'exp'],
      currentDate: now,
    })
    if (!payload.sub || typeof payload.email !== 'string' || !payload.email
      || typeof payload.name !== 'string' || typeof payload.picture !== 'string') {
      throw new AuthError()
    }
    return { sub: payload.sub, email: payload.email, name: payload.name, picture: payload.picture }
  } catch {
    throw new AuthError()
  }
}

export async function authenticate(authorization: string | undefined, env: NodeJS.ProcessEnv): Promise<User> {
  if (authorization === undefined && env.NODE_ENV !== 'production' && env.CLOSEOUT_DEV_EMAIL?.trim()) {
    const email = env.CLOSEOUT_DEV_EMAIL.trim().toLowerCase()
    return { sub: email, email, name: '', picture: '' }
  }
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) throw new AuthError()
  return verifySession(token, env.SESSION_SECRET ?? '')
}
