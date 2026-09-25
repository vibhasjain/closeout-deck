import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOnboardingSync, merge3, SYNC_FIELDS, type SyncPatch } from '@/lib/onboardingSync'
import { DEFAULTS, type Onboarding } from '@/lib/onboarding'
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
const response = (doc: unknown, version = 'v1', status = 200) => new Response(JSON.stringify({ doc, updated_at: version }), { status })
const fullDoc = () => Object.fromEntries(SYNC_FIELDS.map((key) => [key, structuredClone(DEFAULTS[key])]))
function harness(initial: Partial<Onboarding> = {}, persisted: SyncPatch = {}, savedBase: SyncPatch | null = null) {
  let state = { ...structuredClone(DEFAULTS), ...initial }, pending = persisted, base = savedBase
  let remote: Record<string, unknown> = {}, version = 'v1'
  const request = vi.fn<Parameters<typeof createOnboardingSync>[0]['request']>(async (method, body) => {
    if (method === 'PUT') { remote = body!.doc; version += '+' }
    return response(remote, version)
  })
  const sync = createOnboardingSync({ defaults: DEFAULTS,
    read: () => state, apply: (patch) => { state = { ...state, ...patch } },
    loadPending: () => pending, savePending: (patch) => { pending = patch },
    loadBase: () => base, saveBase: (next) => { base = next }, request, status: () => {},
  })
  return { sync, request, state: () => state, pending: () => pending, base: () => base,
    remote: (doc: Record<string, unknown>, v = 'v2') => { remote = doc; version = v },
    puts: () => request.mock.calls.filter(([method]) => method === 'PUT'),
    change: (patch: Partial<Onboarding>) => { state = { ...state, ...patch }; sync.changed(patch) } }
}
describe('canonical onboarding state', () => {
  it('syncs declined automatic-approval offers across devices and clears them for an account without that preference', async () => {
    const one = harness()
    await one.sync.hydrate()
    one.change({ declinedAutoApproveRules: ['CS-01'] })
    await one.sync.flush()
    const saved = one.puts()[0][1]!.doc
    expect(saved.declinedAutoApproveRules).toEqual(['CS-01'])
    const two = harness()
    two.remote(saved)
    await two.sync.hydrate()
    expect(two.state().declinedAutoApproveRules).toEqual(['CS-01'])
    two.remote({})
    await two.sync.pull()
    expect(two.state().declinedAutoApproveRules).toEqual([])
  })
  it('never pushes untouched defaults on first hydrate or focus/flush', async () => {
    const h = harness()
    await h.sync.hydrate(); await h.sync.flush(); await h.sync.pull(); await vi.advanceTimersByTimeAsync(400)
    expect(h.puts()).toHaveLength(0); expect(h.pending()).toEqual({}); expect(h.base()).toEqual({})
  })
  it('discards defaults queued by the old first-hydrate implementation without a base', async () => {
    const h = harness({}, fullDoc())
    h.remote({ frequency: 'Biweekly', forwarded: true, neverContact: ['Jordan'] })
    await h.sync.hydrate(); await h.sync.flush()
    expect(h.puts()).toHaveLength(0)
    expect(h.state()).toMatchObject({ frequency: 'Biweekly', forwarded: true, neverContact: ['Jordan'] })
  })
  it('hydrates canonical fields without overwriting them with local defaults', async () => {
    const h = harness({ profile: { workerHours: 'Old local note' } })
    h.remote({ ...fullDoc(), profile: { workerHours: 'Canonical email' }, frequency: 'Biweekly' })
    await h.sync.hydrate(); await h.sync.flush()
    expect(h.state().profile.workerHours).toBe('Canonical email'); expect(h.state().frequency).toBe('Biweekly'); expect(h.puts()).toHaveLength(0)
  })
  it('seeds only changed local fields when remote is missing or still default', async () => {
    const h = harness({ profile: { workerHours: 'Email' }, forwarded: true })
    h.remote({ payrollConnected: true, forwarded: false, profile: {} })
    await h.sync.hydrate(); await h.sync.flush()
    expect(h.puts()[0][1]?.doc).toEqual({ payrollConnected: true, forwarded: true, profile: { workerHours: 'Email' } }); expect(h.pending()).toEqual({})
  })
  it('pulls before pushing and merges simultaneous names without losing either', async () => {
    const h = harness(); h.remote({ neverContact: ['Existing'] }, 'v1'); await h.sync.hydrate()
    h.change({ neverContact: ['Existing', 'Pat Lee'] })
    h.remote({ neverContact: ['Existing', 'Jordan Smith'], profile: { ratesWhere: 'Contracts' } })
    await h.sync.flush()
    expect(h.puts()[0][1]).toMatchObject({ base_updated_at: 'v2', doc: { neverContact: ['Existing', 'Jordan Smith', 'Pat Lee'], profile: { ratesWhere: 'Contracts' } } })
    expect(h.request.mock.calls.map(([method]) => method)).toEqual(['GET', 'GET', 'PUT'])
  })
  it('a 409 triggers a new pull, three-way merge and conditional retry', async () => {
    const h = harness(); h.remote({ neverContact: [] }, 'v1'); await h.sync.hydrate(); h.change({ neverContact: ['Pat'] })
    h.request.mockResolvedValueOnce(response({ neverContact: [] }, 'v1')).mockImplementationOnce(async () => {
      h.remote({ neverContact: ['Jordan'], customServerField: 123 }, 'v2'); return response({}, 'ignored-conflict-body', 409)
    })
    await h.sync.flush()
    expect(h.request.mock.calls.map(([method]) => method)).toEqual(['GET', 'GET', 'PUT', 'GET', 'PUT'])
    expect(h.puts()[1][1]).toMatchObject({ base_updated_at: 'v2', doc: { neverContact: ['Jordan', 'Pat'], customServerField: 123 } })
  })
  it('keeps edits during a write and pulls again before the next push', async () => {
    const h = harness(); await h.sync.hydrate(); h.change({ profile: { workerHours: 'Email' } })
    let release!: (value: Response) => void
    h.request.mockResolvedValueOnce(response({})).mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const writing = h.sync.flush()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    h.change({ profile: { workerHours: 'Shared sheet' } })
    h.remote({ profile: { workerHours: 'Email', clientHours: 'VMS' } }, 'v2')
    release(response({ profile: { workerHours: 'Email' } }, 'v2')); await writing
    expect(h.puts()[1][1]?.doc.profile).toEqual({ workerHours: 'Shared sheet', clientHours: 'VMS' }); expect(h.pending()).toEqual({})
  })
  it('retains failed writes durably and retries', async () => {
    const h = harness(); await h.sync.hydrate(); h.change({ neverContact: ['Pat'] })
    h.request.mockResolvedValueOnce(response({})).mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(h.sync.flush()).rejects.toThrow('could not be saved'); expect(h.pending()).toEqual({ neverContact: ['Pat'] })
    await h.sync.flush(); expect(h.pending()).toEqual({})
  })
  it('uses a persisted base after reload without restoring unchanged stale scalars', async () => {
    const h = harness({ frequency: 'Weekly' }, { neverContact: ['Pat'], frequency: 'Weekly' }, { neverContact: [], frequency: 'Weekly' })
    h.remote({ neverContact: ['Jordan'], frequency: 'Biweekly' }); await h.sync.hydrate(); await h.sync.flush()
    expect(h.state().neverContact).toEqual(['Jordan', 'Pat']); expect(h.state().frequency).toBe('Biweekly')
  })
  it('focus pull updates untouched scalars and merges edited profile fields', async () => {
    const h = harness(); h.remote({ profile: { workerHours: 'Email', clientHours: 'Email' } }, 'v1'); await h.sync.hydrate()
    h.change({ profile: { workerHours: 'App', clientHours: 'Email' } }); h.remote({ profile: { workerHours: 'Email', clientHours: 'VMS' }, frequency: 'Biweekly' }); await h.sync.pull()
    expect(h.state().profile).toEqual({ workerHours: 'App', clientHours: 'VMS' }); expect(h.state().frequency).toBe('Biweekly')
  })
  it('ignores a delayed focus pull that returns after a newer write', async () => {
    const h = harness(); h.remote({ frequency: 'Weekly' }, 'v1'); await h.sync.hydrate()
    let release!: (value: Response) => void
    h.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const focus = h.sync.pull()
    h.change({ frequency: 'Biweekly' }); await h.sync.flush()
    release(response({ frequency: 'Weekly' }, 'v1')); await focus
    expect(h.state().frequency).toBe('Biweekly'); expect(h.base()?.frequency).toBe('Biweekly')
  })
  it('unions rules by id and names ignoring case, while keeping deliberate removals', () => {
    const one = { id: 'one', sentence: 'Original' }, two = { id: 'two', sentence: 'Local' }, three = { id: 'three', sentence: 'Remote' }
    expect(merge3([one], [one, two], [one, three])).toEqual([one, three, two])
    expect(merge3([], ['Jordan'], ['jordan', 'Pat'])).toEqual(['jordan', 'Pat']); expect(merge3(['Old'], [], ['Old', 'New'])).toEqual(['New'])
  })
  it('cleans an adopted legacy chat field even without user edits, without adding defaults', async () => {
    const h = harness(); h.remote({ chat: [{ id: 'legacy', text: 'Hello' }], customServerField: 'kept' })
    await h.sync.hydrate(); await h.sync.flush()
    expect(h.puts()[0][1]?.doc).toEqual({ customServerField: 'kept' })
  })
  it('excludes 10,000 chat messages and removes legacy chat, keeping state below 64 KiB', async () => {
    const chat = Array.from({ length: 10_000 }, (_, i) => ({ id: `line-${i}`, role: 'agent' as const, text: 'x'.repeat(1500), at: i + 1 }))
    const h = harness({ chat, profile: { workerHours: 'Email' } }); h.remote({ chat, customServerField: 'preserved' }); await h.sync.hydrate(); await h.sync.flush()
    const doc = h.puts()[0][1]!.doc
    expect(doc).not.toHaveProperty('chat'); expect(new TextEncoder().encode(JSON.stringify(doc)).length).toBeLessThan(64 * 1024)
    h.change({ chat: [...chat, { id: 'later', role: 'user', text: 'Hello', at: 10_001 }] }); await h.sync.flush(); expect(h.puts()).toHaveLength(1)
  })
})
