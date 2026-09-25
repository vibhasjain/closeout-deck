import assert from 'node:assert/strict'
import test from 'node:test'
import { GlobalSemaphore, KeyedMutex, QueueFullError, TurnRateLimit, UserQueue } from '../src/queue.js'

test('one turn runs, one waits, and a third receives 429', async () => {
  const queue = new UserQueue()
  const releaseFirst = await queue.acquire('one@hypertrack.io')
  let started = false
  const second = queue.acquire('one@hypertrack.io').then(release => { started = true; return release })
  await Promise.resolve()
  assert.equal(started, false)
  await assert.rejects(queue.acquire('one@hypertrack.io'), (error: unknown) =>
    error instanceof QueueFullError && error.status === 429,
  )
  const releaseOther = await queue.acquire('two@hypertrack.io')
  releaseOther()
  releaseFirst()
  const releaseSecond = await second
  assert.equal(started, true)
  releaseFirst() // release is idempotent and cannot erase the second turn's slot
  const third = queue.acquire('one@hypertrack.io')
  await assert.rejects(queue.acquire('one@hypertrack.io'), QueueFullError)
  releaseSecond()
  ;(await third)()
})

test('global admission allows three runs and rejects the fourth at 30 seconds', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const semaphore = new GlobalSemaphore()
  const releases = await Promise.all([semaphore.acquire(), semaphore.acquire(), semaphore.acquire()])
  let settled = false
  const fourth = semaphore.acquire()
  const rejected = assert.rejects(fourth, (error: unknown) => error instanceof QueueFullError && error.status === 429)
  void fourth.then(() => { settled = true }, () => { settled = true })
  t.mock.timers.tick(29_999)
  await Promise.resolve()
  assert.equal(settled, false)
  t.mock.timers.tick(1)
  await rejected
  for (const release of releases) release()
  ;(await semaphore.acquire())()
})

test('global admission hands off capacity and removes disconnected waiters', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const semaphore = new GlobalSemaphore()
  const releases = await Promise.all([semaphore.acquire(), semaphore.acquire(), semaphore.acquire()])
  const controller = new AbortController()
  const abandoned = semaphore.acquire(controller.signal)
  const rejected = assert.rejects(abandoned, { name: 'AbortError' })
  const next = semaphore.acquire()
  controller.abort()
  await rejected
  releases[0]()
  const releaseNext = await next
  t.mock.timers.tick(30_000)
  releaseNext()
  releases.forEach(release => release())
  const replacement = await Promise.all([semaphore.acquire(), semaphore.acquire(), semaphore.acquire()])
  replacement.forEach(release => release())
})

test('per-email rate limit is thirty turns per sliding ten-minute window', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const rate = new TurnRateLimit()
  for (let i = 0; i < 30; i += 1) rate.consume('Person@hypertrack.io')
  assert.throws(() => rate.consume('person@hypertrack.io'), QueueFullError)
  rate.consume('another@hypertrack.io')
  t.mock.timers.tick(599_999)
  assert.throws(() => rate.consume('person@hypertrack.io'), QueueFullError)
  t.mock.timers.tick(1)
  rate.consume('person@hypertrack.io')
})

test('a disconnected waiter frees its waiting place without releasing the active turn', async () => {
  const queue = new UserQueue()
  const active = await queue.acquire('person@hypertrack.io')
  const controller = new AbortController()
  const abandoned = queue.acquire('person@hypertrack.io', controller.signal)
  controller.abort()
  await assert.rejects(abandoned, { name: 'AbortError' })
  const replacement = queue.acquire('person@hypertrack.io')
  await assert.rejects(queue.acquire('person@hypertrack.io'), QueueFullError)
  active()
  ;(await replacement)()
  await assert.rejects(queue.acquire('person@hypertrack.io', controller.signal), { name: 'AbortError' })
  ;(await queue.acquire('person@hypertrack.io'))()
})

test('KeyedMutex runs one holder per account in FIFO order and never rejects waiters', async () => {
  const lock = new KeyedMutex()
  const order: number[] = []
  const first = await lock.acquire('A@hypertrack.io')
  const waiters = [1, 2, 3].map(n => lock.acquire('a@hypertrack.io').then(release => { order.push(n); release() }))
  const other = await lock.acquire('b@hypertrack.io')
  other()
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.deepEqual(order, [])
  first()
  await Promise.all(waiters)
  assert.deepEqual(order, [1, 2, 3])
})
