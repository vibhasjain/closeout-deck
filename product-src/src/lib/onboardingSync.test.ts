import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOnboardingSync, SYNC_FIELDS, type SyncPatch, type SyncStatus } from '@/lib/onboardingSync'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
const response = (doc: unknown, version = 'v1', status = 200) => new Response(JSON.stringify({ doc, updated_at: version }), { status })
const fullDoc = () => Object.fromEntries(SYNC_FIELDS.map((key) => [key, structuredClone(DEFAULTS[key])]))

function harness(initial: Partial<Onboarding> = {}, persisted: SyncPatch = {}) {
  let state = { ...structuredClone(DEFAULTS), ...initial }
  let pending = persisted
  let status: SyncStatus = { ready: false, loading: false, saving: false, error: null }
  const request = vi.fn<Parameters<typeof createOnboardingSync>[0]['request']>()
  const sync = createOnboardingSync({
    read: () => state, apply: (patch) => { state = { ...state, ...patch } },
    loadPending: () => pending, savePending: (patch) => { pending = patch },
    request, status: (next) => { status = next },
  })
  return { sync, request, state: () => state, pending: () => pending, status: () => status,
    change: (patch: Partial<Onboarding>) => { state = { ...state, ...patch }; sync.changed(patch) } }
}

describe('canonical onboarding state', () => {
  it('hydrates existing canonical fields without overwriting them with local defaults', async () => {
    const h = harness({ profile: { workerHours: 'Old local note' } })
    h.request.mockResolvedValue(response({ ...fullDoc(), profile: { workerHours: 'Canonical email' }, frequency: 'Biweekly' }))
    await h.sync.hydrate()
    await h.sync.flush()
    expect(h.state().profile.workerHours).toBe('Canonical email')
    expect(h.state().frequency).toBe('Biweekly')
    expect(h.request).toHaveBeenCalledTimes(1)
    expect(h.status()).toEqual({ ready: true, loading: false, saving: false, error: null })
  })
  it('seeds only missing P6 fields and preserves unrelated canonical data', async () => {
    const h = harness({ profile: { workerHours: 'Email' } })
    h.request.mockResolvedValueOnce(response({ payrollConnected: true, firm: { name: 'Saved firm' } }))
      .mockImplementationOnce(async (_method, body) => response(body!.doc, 'v2'))
    await h.sync.hydrate()
    await h.sync.flush()
    const [, body] = h.request.mock.calls[1]
    expect(body).toMatchObject({ base_updated_at: 'v1', doc: { payrollConnected: true, firm: { name: 'Saved firm' }, profile: { workerHours: 'Email' } } })
    expect(h.pending()).toEqual({})
  })
  it('rebases dirty fields after a 409 without resetting unrelated newer fields', async () => {
    const h = harness()
    h.request.mockResolvedValueOnce(response(fullDoc()))
    await h.sync.hydrate()
    h.change({ neverContact: ['Pat'] })
    h.request.mockResolvedValueOnce(response({ ...fullDoc(), profile: { ratesWhere: 'Client contracts' }, customServerField: 123 }, 'v2', 409))
      .mockImplementationOnce(async (_method, body) => response(body!.doc, 'v3'))
    await h.sync.flush()
    expect(h.request.mock.calls[2][1]).toMatchObject({ base_updated_at: 'v2', doc: { neverContact: ['Pat'], profile: { ratesWhere: 'Client contracts' }, customServerField: 123 } })
    expect(h.state().profile.ratesWhere).toBe('Client contracts')
  })
  it('keeps edits made during a write and sends them after the first response', async () => {
    const h = harness()
    h.request.mockResolvedValueOnce(response(fullDoc()))
    await h.sync.hydrate()
    h.change({ profile: { workerHours: 'Email' } })
    let release!: (response: Response) => void
    h.request.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
      .mockImplementationOnce(async (_method, body) => response(body!.doc, 'v3'))
    const writing = h.sync.flush()
    await Promise.resolve()
    h.change({ profile: { workerHours: 'Shared sheet' } })
    release(response({ ...fullDoc(), profile: { workerHours: 'Email' } }, 'v2'))
    await writing
    expect(h.request.mock.calls[2][1]?.doc.profile).toEqual({ workerHours: 'Shared sheet' })
    expect(h.state().profile.workerHours).toBe('Shared sheet')
    expect(h.pending()).toEqual({})
  })
  it('retains failed writes durably, exposes errors, and retries before continuing', async () => {
    const h = harness()
    h.request.mockResolvedValueOnce(response(fullDoc()))
    await h.sync.hydrate()
    h.change({ neverContact: ['Pat'] })
    h.request.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(h.sync.flush()).rejects.toThrow('could not be saved')
    expect(h.pending()).toEqual({ neverContact: ['Pat'] })
    expect(h.status().error).toContain('could not be saved')
    h.request.mockImplementationOnce(async (_method, body) => response(body!.doc, 'v2'))
    await h.sync.flush()
    expect(h.status().error).toBeNull()
  })
  it('replays durable pending edits over fetched state after a reload', async () => {
    const h = harness({}, { neverContact: ['Pat'] })
    h.request.mockResolvedValueOnce(response(fullDoc())).mockImplementationOnce(async (_method, body) => response(body!.doc, 'v2'))
    await h.sync.hydrate()
    expect(h.state().neverContact).toEqual(['Pat'])
    await h.sync.flush()
    expect(h.request.mock.calls[1][1]?.doc.neverContact).toEqual(['Pat'])
  })
  it('autosaves changes and reports unavailable canonical state as an error', async () => {
    const h = harness()
    h.request.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(h.sync.hydrate()).rejects.toThrow('could not be loaded')
    expect(h.status().error).toContain('could not be loaded')
    h.request.mockResolvedValueOnce(response(fullDoc()))
    await h.sync.hydrate()
    h.change({ authority: { ...DEFAULTS.authority, limit: 500 } })
    h.request.mockImplementationOnce(async (_method, body) => response(body!.doc, 'v2'))
    await vi.advanceTimersByTimeAsync(351)
    expect(h.pending()).toEqual({})
    expect(h.request.mock.calls[2][1]?.doc.authority).toMatchObject({ limit: 500 })
  })
})
