import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/lib/api'
import * as onboarding from '@/lib/onboarding'
import { DEFAULTS } from '@/lib/onboarding'
import { getDataSnapshot, invalidate, publishCycle, refreshCycle, type CyclePayload, type CycleSummary } from '@/lib/data'
import { decide, watchJourneyCycle, type JourneyDecision } from '@/lib/journey'
import fixture from '@/lib/fixtures/server-cycle.json'

const payload = fixture.payload as CyclePayload
const row: CycleSummary = { ...payload.cycle, sample: false, runAt: null, totals: null, counts: { set1: 0, set2: 0, set3: 0 }, findings: 0 }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
let ready = false
const request = async (path: string) => {
  if (path === '/data/cycles') return response({ cycles: [ready ? { ...row, runAt: payload.runAt, counts: payload.counts } : row], sources: [] })
  if (path === '/files') return response({ files: [] })
  return ready ? response(payload) : response({ error: 'not_found' }, 404)
}
beforeEach(async () => {
  vi.useFakeTimers()
  ready = false
  vi.spyOn(onboarding, 'getOnboarding').mockReturnValue({ ...DEFAULTS, dataSource: 'server' })
  vi.spyOn(onboarding, 'updateOnboarding').mockImplementation(() => {})
  vi.spyOn(onboarding, 'flushOnboarding').mockResolvedValue()
  vi.spyOn(api, 'authedFetch').mockImplementation(request)
  await invalidate()
  vi.mocked(api.authedFetch).mockClear()
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('cycle cards before a run exists', () => {
  it('treats a detail 404 as Running and never writes a global error', async () => {
    expect(await refreshCycle(payload.cycle.id)).toEqual({ state: 'running', error: null })
    expect(getDataSnapshot()).toMatchObject({ error: null, payloads: [], list: [{ runAt: null, counts: row.counts }] })
  })
  it('backs off 404 polls, caps the wait at 30 seconds, and cancels on unmount', async () => {
    const receive = vi.fn(), stop = watchJourneyCycle(payload.cycle.id, receive)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.authedFetch).toHaveBeenCalledTimes(1)
    for (const [delay, calls] of [[2000, 2], [4000, 3], [8000, 4], [16000, 5], [30000, 6], [30000, 7]]) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(api.authedFetch).toHaveBeenCalledTimes(calls - 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(api.authedFetch).toHaveBeenCalledTimes(calls)
    }
    expect(receive).toHaveBeenLastCalledWith({ state: 'running', error: null })
    stop()
    await vi.advanceTimersByTimeAsync(60000)
    expect(api.authedFetch).toHaveBeenCalledTimes(7)
  })
  it('backs off a card error without polluting other cards or the Payroll error', async () => {
    vi.mocked(api.authedFetch).mockImplementation(path => path.endsWith('/bad') ? Promise.reject(new Error('Connection interrupted')) : request(path))
    const receive = vi.fn(), stop = watchJourneyCycle('bad', receive)
    await vi.advanceTimersByTimeAsync(0)
    expect(receive).toHaveBeenLastCalledWith({ state: 'error', error: 'Connection interrupted' })
    expect(await refreshCycle(payload.cycle.id)).toEqual({ state: 'running', error: null })
    expect(getDataSnapshot().error).toBeNull()
    await vi.advanceTimersByTimeAsync(6000)
    expect(vi.mocked(api.authedFetch).mock.calls.filter(([path]) => path.endsWith('/bad'))).toHaveLength(3)
    stop()
  })
  it('wakes a backed-off card on invalidation and stops when ingestion publishes a run', async () => {
    const receive = vi.fn(), stop = watchJourneyCycle(payload.cycle.id, receive)
    await vi.advanceTimersByTimeAsync(6000)
    const detailReads = () => vi.mocked(api.authedFetch).mock.calls.filter(([path]) => path === `/data/cycles/${payload.cycle.id}`).length
    expect(detailReads()).toBe(3)
    await invalidate()
    await vi.advanceTimersByTimeAsync(0)
    expect(detailReads()).toBe(4)
    ready = true
    await invalidate()
    expect(receive).toHaveBeenLastCalledWith({ state: 'done', error: null })
    const completedReads = detailReads()
    await vi.advanceTimersByTimeAsync(60000)
    expect(detailReads()).toBe(completedReads)
    stop()
  })
  it('keeps a stale list row with a missing detail in Running without a global error', async () => {
    vi.mocked(api.authedFetch).mockImplementation(path => path === '/data/cycles'
      ? Promise.resolve(response({ cycles: [{ ...row, runAt: payload.runAt }], sources: [] })) : request(path))
    await invalidate()
    expect(getDataSnapshot()).toMatchObject({ error: null, cycleErrors: {}, payloads: [], list: [{ runAt: null }] })
  })
  it('scopes a failed detail refresh to that cycle and retains its previous payload', async () => {
    publishCycle(payload)
    ready = true
    vi.mocked(api.authedFetch).mockImplementation(path => path === `/data/cycles/${payload.cycle.id}`
      ? Promise.reject(new Error('Cycle temporarily unavailable')) : request(path))
    await invalidate()
    expect(getDataSnapshot()).toMatchObject({ error: null, cycleErrors: { [payload.cycle.id]: 'Cycle temporarily unavailable' }, payloads: [payload] })
  })
})

describe('decision response refresh', () => {
  it('publishes the decision and refreshes only the cycle list, without reloading cycles or files', async () => {
    publishCycle(payload)
    const saved: JourneyDecision = { id: 'decision-a', cycleId: payload.cycle.id, groupId: 'CS-01', shiftIds: [], decision: 'approved', reason: null, by: 'user', at: '2026-09-25T12:00:00Z' }
    vi.mocked(api.authedFetch).mockImplementation((path, init) => init?.method === 'POST'
      ? Promise.resolve(response({ decision: saved, cycle: { ...payload, decisions: [saved] } })) : request(path))
    await decide(payload.cycle.id, { groupId: 'CS-01', decision: 'approved' })
    expect(vi.mocked(api.authedFetch).mock.calls.map(([path]) => path)).toEqual([`/data/cycles/${payload.cycle.id}/decisions`, '/data/cycles'])
    expect(getDataSnapshot().payloads[0].decisions).toEqual([saved])
  })
})
