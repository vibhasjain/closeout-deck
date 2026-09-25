import assert from 'node:assert/strict'
import test from 'node:test'
import { QueueFullError, UserQueue } from '../src/queue.js'

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
