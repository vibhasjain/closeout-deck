import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPair, SignJWT } from 'jose'
import { authenticate, AuthError, isAllowedEmail, SESSION_SECONDS, signSession, verifyGoogleIdToken, verifySession } from '../src/auth.ts'

const user = { sub: 'google-123', email: 'alex@hypertrack.io', name: 'Alex', picture: 'https://example.com/alex.png' }
const secret = 'test-secret-with-at-least-thirty-two-bytes'

test('allowed domains match exactly, ignoring case and comma-list whitespace', () => {
  assert.equal(isAllowedEmail('alex@hypertrack.io', 'hypertrack.io'), true)
  assert.equal(isAllowedEmail('alex@HYPERTRACK.IO', 'HyperTrack.IO'), true)
  assert.equal(isAllowedEmail('alex@evilhypertrack.io', 'hypertrack.io'), false)
  assert.equal(isAllowedEmail('alex@hypertrack.io.evil.com', 'hypertrack.io'), false)
  assert.equal(isAllowedEmail('alex@other.com', '  hypertrack.io , Other.COM , '), true)
  assert.equal(isAllowedEmail('alex@hypertrack.io@evil.com', 'hypertrack.io'), false)
  assert.equal(isAllowedEmail('alex@evil.com@hypertrack.io', 'hypertrack.io'), true)
  assert.equal(isAllowedEmail('hypertrack.io', 'hypertrack.io'), false)
  assert.equal(isAllowedEmail('alex@hypertrack.io', ''), false)
})

test('session JWT round trips all claims and expires exactly after 30 days', async () => {
  const now = new Date('2026-09-25T12:00:00Z')
  const session = await signSession(user, secret, now)
  assert.equal(session.exp, now.getTime() / 1000 + SESSION_SECONDS)
  assert.deepEqual(await verifySession(session.sessionToken, secret, now), user)
  assert.deepEqual(await verifySession(session.sessionToken, secret, new Date(session.exp * 1000 - 1)), user)
  await assert.rejects(verifySession(session.sessionToken, secret, new Date(session.exp * 1000)), AuthError)
  await assert.rejects(verifySession(session.sessionToken, 'a-different-secret', now), AuthError)
})

test('dev identity is available only outside production and without an Authorization header', async () => {
  const env = { NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: 'Dev@Hypertrack.io' }
  assert.equal((await authenticate(undefined, env)).email, 'dev@hypertrack.io')
  await assert.rejects(authenticate(undefined, { ...env, NODE_ENV: 'production' }), AuthError)
  await assert.rejects(authenticate('Bearer invalid', env), AuthError)
  await assert.rejects(authenticate('Basic invalid', env), AuthError)
  await assert.rejects(authenticate(undefined, { NODE_ENV: 'development' }), AuthError)
})

test('Google tokens require trusted issuer, audience, verified email, expiry, and signature', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const keys = async () => publicKey
  const token = async (overrides: Record<string, unknown> = {}) => new SignJWT({
    sub: user.sub, email: user.email, name: user.name, picture: user.picture,
    email_verified: true, iss: 'https://accounts.google.com', aud: 'google-client',
    exp: Math.floor(Date.now() / 1000) + 300, ...overrides,
  }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey)
  assert.deepEqual(await verifyGoogleIdToken(await token(), 'google-client', keys), user)
  assert.deepEqual(await verifyGoogleIdToken(await token({ iss: 'accounts.google.com' }), 'google-client', keys), user)
  for (const overrides of [
    { iss: 'https://attacker.example' }, { aud: 'wrong-client' }, { email_verified: false },
    { email_verified: 'true' }, { exp: 1 }, { email: null },
  ]) {
    await assert.rejects(verifyGoogleIdToken(await token(overrides), 'google-client', keys), AuthError)
  }
  await assert.rejects(verifyGoogleIdToken('not-a-jwt', 'google-client', keys), AuthError)
})
