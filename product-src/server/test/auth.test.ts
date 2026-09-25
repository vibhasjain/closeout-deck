import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPair, SignJWT } from 'jose'
import { authenticate, AuthError, InviteOnlyError, isAllowedEmail, SESSION_SECONDS, signSession, validateSessionSecret, verifyGoogleIdToken, verifySession } from '../src/auth.ts'

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

test('session JWT round trips all claims and expires exactly after 7 days', async () => {
  const now = new Date('2026-09-25T12:00:00Z')
  const session = await signSession(user, secret, now)
  assert.equal(SESSION_SECONDS, 7 * 24 * 60 * 60)
  assert.equal(session.exp, now.getTime() / 1000 + SESSION_SECONDS)
  assert.deepEqual(await verifySession(session.sessionToken, secret, now), user)
  assert.deepEqual(await verifySession(session.sessionToken, secret, new Date(session.exp * 1000 - 1)), user)
  await assert.rejects(verifySession(session.sessionToken, secret, new Date(session.exp * 1000)), AuthError)
  await assert.rejects(verifySession(session.sessionToken, 'a-different-secret', now), AuthError)
})

test('session secrets require at least 32 UTF-8 bytes', () => {
  for (const value of [undefined, '', 'x'.repeat(31), 'é'.repeat(15)]) {
    assert.throws(() => validateSessionSecret(value), /SESSION_SECRET must be at least 32 bytes/)
  }
  assert.doesNotThrow(() => validateSessionSecret('x'.repeat(32)))
  assert.doesNotThrow(() => validateSessionSecret('é'.repeat(16)))
})

test('authenticate rechecks the current domain allowlist for every session request', async () => {
  const session = await signSession(user, secret)
  const env = { NODE_ENV: 'production', SESSION_SECRET: secret, ALLOWED_DOMAINS: 'hypertrack.io' }
  const authorization = `Bearer ${session.sessionToken}`
  assert.deepEqual(await authenticate(authorization, env), user)
  env.ALLOWED_DOMAINS = 'other.com'
  await assert.rejects(authenticate(authorization, env), AuthError)
  env.ALLOWED_DOMAINS = ''
  await assert.rejects(authenticate(authorization, env), AuthError)
  env.ALLOWED_DOMAINS = ' HyperTrack.IO '
  assert.deepEqual(await authenticate(authorization, env), user)
})

test('dev identity requires development, a loopback connection, and no Authorization header', async () => {
  const env = { NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: 'Dev@Hypertrack.io', ALLOWED_DOMAINS: 'hypertrack.io' }
  for (const address of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1']) {
    assert.equal((await authenticate(undefined, env, address)).email, 'dev@hypertrack.io')
  }
  for (const address of [undefined, '192.168.1.2', '8.8.8.8', '::ffff:192.168.1.2', '127.evil.com', 'localhost', '::ffff:::1']) {
    await assert.rejects(authenticate(undefined, env, address), AuthError)
  }
  for (const nodeEnv of [undefined, 'test', 'production']) {
    await assert.rejects(authenticate(undefined, { ...env, NODE_ENV: nodeEnv }, '127.0.0.1'), AuthError)
  }
  await assert.rejects(authenticate('Bearer invalid', env, '127.0.0.1'), AuthError)
  await assert.rejects(authenticate('Basic invalid', env, '127.0.0.1'), AuthError)
  await assert.rejects(authenticate(undefined, { NODE_ENV: 'development' }, '127.0.0.1'), AuthError)
  for (const domains of [undefined, '', 'other.com']) {
    await assert.rejects(authenticate(undefined, { ...env, ALLOWED_DOMAINS: domains }, '127.0.0.1'), AuthError)
  }
})

test('Google tokens require trusted issuer, audience, verified email, expiry, and signature', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const keys = async () => publicKey
  const token = async (overrides: Record<string, unknown> = {}) => new SignJWT({
    sub: user.sub, email: user.email, name: user.name, picture: user.picture,
    email_verified: true, hd: 'hypertrack.io', iss: 'https://accounts.google.com', aud: 'google-client',
    exp: Math.floor(Date.now() / 1000) + 300, ...overrides,
  }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey)
  const verify = async (overrides: Record<string, unknown> = {}, domains = 'hypertrack.io') =>
    verifyGoogleIdToken(await token(overrides), 'google-client', keys, domains)
  assert.deepEqual(await verify(), user)
  assert.deepEqual(await verify({ iss: 'accounts.google.com' }), user)
  assert.deepEqual(await verify({ hd: 'HYPERTRACK.IO' }, ' HyperTrack.IO '), user)
  for (const overrides of [
    { iss: 'https://attacker.example' }, { aud: 'wrong-client' }, { email_verified: false },
    { email_verified: 'true' }, { exp: 1 }, { email: null },
    { hd: undefined }, { hd: null }, { hd: 123 }, { hd: 'other.com' },
    { hd: 'hypertrack.io', email: 'alex@other.com' },
  ]) {
    await assert.rejects(verify(overrides), error => error instanceof AuthError && !(error instanceof InviteOnlyError))
  }
  await assert.rejects(verify({}, 'other.com'), InviteOnlyError)
  await assert.rejects(verify({}, ''), InviteOnlyError)
  await assert.rejects(verifyGoogleIdToken('not-a-jwt', 'google-client', keys, 'hypertrack.io'), AuthError)
})
