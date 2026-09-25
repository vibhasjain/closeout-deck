import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import type { JWTVerifyGetKey } from 'jose'
import { isIP } from 'node:net'

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
export const SESSION_SECONDS = 7 * 24 * 60 * 60

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

export class InviteOnlyError extends AuthError {
  constructor() {
    super()
    this.message = 'invite_only'
    this.name = 'InviteOnlyError'
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
  allowedDomains = process.env.ALLOWED_DOMAINS ?? '',
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
    const email = payload.email.trim().toLowerCase()
    if (typeof payload.hd !== 'string'
      || payload.hd.toLowerCase() !== email.slice(email.lastIndexOf('@') + 1)) {
      throw new AuthError()
    }
    if (!isAllowedEmail(email, allowedDomains)) throw new InviteOnlyError()
    return {
      sub: payload.sub,
      email,
      name: typeof payload.name === 'string' ? payload.name : '',
      picture: typeof payload.picture === 'string' ? payload.picture : '',
    }
  } catch (error) {
    if (error instanceof InviteOnlyError) throw error
    throw new AuthError()
  }
}

export function validateSessionSecret(secret: string | undefined): void {
  if (Buffer.byteLength(secret ?? '', 'utf8') < 32) {
    throw new Error('SESSION_SECRET must be at least 32 bytes.')
  }
}

function signingKey(secret: string): Uint8Array {
  validateSessionSecret(secret)
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

function isLoopback(remoteAddress: string | undefined): boolean {
  if (!remoteAddress || !isIP(remoteAddress)) return false
  const address = remoteAddress.toLowerCase().replace(/^::ffff:/, '')
  return address === '::1' || (isIP(address) === 4 && address.startsWith('127.'))
}

export async function authenticate(
  authorization: string | undefined,
  env: NodeJS.ProcessEnv,
  remoteAddress?: string,
): Promise<User> {
  if (authorization === undefined && env.NODE_ENV === 'development'
    && isLoopback(remoteAddress) && env.CLOSEOUT_DEV_EMAIL?.trim()) {
    const email = env.CLOSEOUT_DEV_EMAIL.trim().toLowerCase()
    if (!isAllowedEmail(email, env.ALLOWED_DOMAINS ?? '')) throw new AuthError()
    return { sub: email, email, name: '', picture: '' }
  }
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) throw new AuthError()
  const user = await verifySession(token, env.SESSION_SECRET ?? '')
  if (!isAllowedEmail(user.email, env.ALLOWED_DOMAINS ?? '')) throw new AuthError()
  return user
}
