import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { isCard, parseCards, appendTrace, stream, type Action, type ChatContext } from '@/lib/chat'
import { applyAction, isAction } from '@/components/chat/ChatPane'
import { Message } from '@/components/chat/Message'
import { DEFAULTS, flushOnboarding, type Onboarding } from '@/lib/onboarding'
import { createChatHistory } from '@/lib/chatHistory'
import { askGaps, createDispute, decide, downloadBatch, getDisputes, getThreads, recordMessage, resolveDispute, sendPayroll, simulateDispute, type JourneyBatch, type JourneyDecision, type JourneyDispute } from '@/lib/journey'
import { getDataSnapshot, hydrate, invalidate, publishCycle, refreshCycleList, type CyclePayload } from '@/lib/data'
import { rowResolution } from '@/lib/desk'
import * as memory from '@/lib/memory'
import fixture from '@/lib/fixtures/server-cycle.json'

vi.mock('@/lib/viewerSession', () => ({ viewerSession: () => ({ email: 'contract@example.test', sessionToken: 'test-session', exp: 9999999999 }), signOut: vi.fn() }))
vi.mock('@/lib/onboarding', async original => ({ ...await original<typeof import('@/lib/onboarding')>(), flushOnboarding: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/data', async original => ({ ...await original<typeof import('@/lib/data')>(), invalidate: vi.fn().mockResolvedValue(undefined), refreshCycleList: vi.fn().mockResolvedValue(undefined) }))
const payload = fixture.payload as CyclePayload
const batch: JourneyBatch = { id: 'batch-a', cycleId: payload.cycle.id, workers: 11, gross: 1200, held: 1, destination: 'ADP', createdAt: '2026-09-25T12:00:00Z' }
const decision: JourneyDecision = { id: 'decision-a', cycleId: payload.cycle.id, groupId: 'CS-01', shiftIds: [], decision: 'approved', reason: null, by: 'user', at: '2026-09-25T12:00:00Z' }
const dispute: JourneyDispute = { id: 'dispute-a', cycleId: payload.cycle.id, worker: 'Ana Peña', description: 'Missing interval', source: 'paste', status: 'open', createdAt: '2026-09-25T12:00:00Z', adjustment: null }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('journey card and action contract', () => {
  const cards = [
    { kind: 'task', cycleId: '2026-09-20' }, { kind: 'findings', cycleId: '2026-09-20' },
    ...['connect', 'gaps', 'send', 'dispute'].map(form => ({ kind: 'form', form, cycleId: '2026-09-20', prefill: { worker: 'Ana' } })),
    { kind: 'choice', ask: 'Which source?', yours: 'Upload yours', sample: 'Use sample', set: 2 },
  ]
  it.each(cards)('accepts reference card %# without adding data', card => {
    expect(isCard(card)).toBe(true)
    expect(parseCards(`Server prose\n\`\`\`card\n${JSON.stringify(card)}\n\`\`\``)).toEqual({ text: 'Server prose', cards: [card], invalid: false })
  })
  it.each([
    { kind: 'task', cycleId: '' }, { kind: 'findings', cycleId: 1 }, { kind: 'task', cycleId: 'x', count: 10 },
    { kind: 'form', cycleId: 'x', form: 'pay' }, { kind: 'form', cycleId: 'x', form: 'send', prefill: [] },
    { kind: 'form', cycleId: 'x', form: ['connect'] },
    { kind: 'choice', ask: 'Pick', yours: 'Upload', sample: 'Sample', set: '2' },
    { kind: 'choice', ask: 'Pick', yours: 'Upload', sample: '' },
  ])('rejects malformed card %#', card => expect(isCard(card)).toBe(false))
  it.each([
    { type: 'approve', cycleId: '2026-09-20', groupId: 'CS-01' },
    { type: 'dismiss', cycleId: '2026-09-20', groupId: 'CS-01', reason: 'Verified original time' },
    ...['connect', 'gaps', 'send', 'dispute'].map(form => ({ type: 'open_form', form, cycleId: '2026-09-20' })),
  ])('validates action %# through the ChatPane export', action => expect(isAction(action)).toBe(true))
  it.each([
    { type: 'approve', cycleId: '', groupId: 'x' }, { type: 'approve', cycleId: 'x', groupId: 'x', force: true },
    { type: 'dismiss', cycleId: 'x', groupId: 'x' }, { type: 'dismiss', cycleId: 'x', groupId: 'x', reason: ' ' },
    { type: 'open_form', cycleId: 'x', form: 'unknown' },
  ])('rejects malformed action %#', action => expect(isAction(action)).toBe(false))
  it('applies approve and dismiss with the exact bodies and publishes server data', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const input = JSON.parse(String(init?.body))
      const saved = { ...decision, ...input }
      return response({ decision: saved, cycle: { ...payload, decisions: [saved] } })
    })
    for (const action of [
      { type: 'approve', cycleId: payload.cycle.id, groupId: 'CS-01' },
      { type: 'dismiss', cycleId: payload.cycle.id, groupId: 'CS-01', reason: 'Verified original time' },
    ] as Action[]) await applyAction(action, vi.fn(), vi.fn(), new URLSearchParams())
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { groupId: 'CS-01', decision: 'approved' }, { groupId: 'CS-01', decision: 'dismissed', reason: 'Verified original time' },
    ])
    expect(getDataSnapshot().payloads.find(item => item.cycle.id === payload.cycle.id)?.decisions?.[0].decision).toBe('dismissed')
    expect(invalidate).not.toHaveBeenCalled()
    expect(refreshCycleList).toHaveBeenCalledTimes(2)
    expect(flushOnboarding).toHaveBeenCalledTimes(2)
    expect(vi.mocked(flushOnboarding).mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0])
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer test-session')
  })
  it('opens a referenced form on the existing reply without scripting agent text', () => {
    let state: Onboarding = { ...DEFAULTS, chat: [{ id: 'a', role: 'agent', text: 'Text from server', at: 1 }] }
    const update = (patch: Partial<Onboarding> | ((state: Onboarding) => Partial<Onboarding>)) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) } }
    const action: Action = { type: 'open_form', cycleId: payload.cycle.id, form: 'send' }
    applyAction(action, update, vi.fn(), new URLSearchParams())
    applyAction(action, update, vi.fn(), new URLSearchParams())
    expect(state.chat).toHaveLength(1)
    expect(state.chat[0]).toMatchObject({ text: 'Text from server', cards: [{ kind: 'form', form: 'send', cycleId: payload.cycle.id }] })
  })
  it('uses server decisions across the carousel and work-pane row readers, ignoring stale local decisions', () => {
    const cycle = hydrate({ ...payload, decisions: [{ ...decision, groupId: 'SRC-VMS-01', decision: 'approved' }] }, DEFAULTS)
    expect(rowResolution(cycle, cycle.week[0].id, 'SRC-VMS-01', {})).toBe('applied')
    expect(rowResolution(cycle, cycle.week[0].id, 'OTHER', { [cycle.id]: { [cycle.week[0].id]: 'applied' } })).toBeUndefined()
    expect(hydrate({ ...payload, batch }, DEFAULTS).statusTag).toBe('Paid')
  })
  it('derives Paid from the sent batch separately from contract next-step ordering or calendar dates', () => {
    const missing: CyclePayload = { ...payload, batch, nextStep: { kind: 'get_timesheets', label: 'Get timesheets', detail: 'Missing location', counts: { missingSets: 1, gaps: 0, openGroups: 0 } } }
    expect(hydrate(missing, DEFAULTS)).toMatchObject({ statusTag: 'Paid', nextStep: { kind: 'get_timesheets' } })
    expect(hydrate({ ...payload, cycle: { ...payload.cycle, status: 'reviewed' }, batch: null }, DEFAULTS).statusTag).toBe('Pending')
  })
})

describe('journey transport', () => {
  it('uses one canonical identity for numeric aliases and rule actions', async () => {
    const cycle = { ...payload, groups: [{ ...payload.groups[0], id: 77, ruleId: 'CS-01' }], extraGroups: [] }
    publishCycle(cycle)
    fetchMock.mockImplementation(async () => response({ decision, cycle: { ...cycle, decisions: [decision] } }))
    await decide(payload.cycle.id, { groupId: '77', decision: 'approved' })
    await decide(payload.cycle.id, { groupId: 'CS-01', decision: 'approved' })
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).groupId)).toEqual(['CS-01', 'CS-01'])
  })
  it('does not export while pending profile or rule changes cannot be saved', async () => {
    vi.mocked(flushOnboarding).mockRejectedValueOnce(new Error('Profile sync failed'))
    await expect(sendPayroll(payload.cycle.id)).rejects.toThrow('Profile sync failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([201, 409, 422])('preserves send status %s and never forces or retries a send', async status => {
    const schedule = vi.spyOn(memory, 'scheduleMemoryRefresh').mockImplementation(() => {})
    const body = status === 422 ? { reason: 'Review open items', open: { missingSets: [3], gaps: ['site|worker|1'], groups: ['CS-01'] } }
      : { batch, ...(status === 201 ? { csvUrl: '/data/batches/batch-a/csv' } : {}) }
    fetchMock.mockResolvedValueOnce(response(body, status))
    expect(await sendPayroll(payload.cycle.id, { destination: 'ADP' })).toEqual({ status, ...body })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/data/cycles/${payload.cycle.id}/send`)
    expect(schedule).toHaveBeenCalledTimes(status === 201 ? 1 : 0)
    schedule.mockRestore()
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ destination: 'ADP' })
  })
  it('posts asks, messages, disputes and resolutions using only contract fields', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (!init?.method) return response(String(url).includes('/disputes') ? { disputes: [dispute] } : { threads: [] })
      if (String(url).endsWith('/asks')) return response({ threads: [], skipped: ['Never Contact Person'] })
      if (String(url).endsWith('/messages')) return response({ message: { id: 'message-a' } })
      return response({ dispute, thread: { id: 'thread-a' } })
    })
    expect(await askGaps(payload.cycle.id, { gapIds: ['site|worker|1'] })).toEqual({ threads: [], skipped: ['Never Contact Person'] })
    await getThreads(payload.cycle.id)
    await recordMessage('thread/a', { dir: 'in', text: 'Confirmed 8 hours' })
    await getDisputes()
    await createDispute({ cycleId: payload.cycle.id, worker: 'Ana Peña', description: 'Missing interval', source: 'paste' })
    await simulateDispute(payload.cycle.id)
    await resolveDispute(dispute.id, { decision: 'adjust', hours: 2, amount: 40, note: 'Verified location' })
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([url, init]) => [url, JSON.parse(String(init?.body))])
    expect(posts).toEqual([
      [`/api/data/cycles/${payload.cycle.id}/asks`, { gapIds: ['site|worker|1'] }],
      ['/api/data/threads/thread%2Fa/messages', { dir: 'in', text: 'Confirmed 8 hours' }],
      ['/api/data/disputes', { cycleId: payload.cycle.id, worker: 'Ana Peña', description: 'Missing interval', source: 'paste' }],
      ['/api/data/disputes/simulate', { cycleId: payload.cycle.id }],
      ['/api/data/disputes/dispute-a/resolve', { decision: 'adjust', hours: 2, amount: 40, note: 'Verified location' }],
    ])
  })
  it('surfaces failed mutations without claiming a decision was saved', async () => {
    fetchMock.mockResolvedValueOnce(response({ error: 'invalid_input' }, 400))
    await expect(decide(payload.cycle.id, { groupId: 'CS-01', decision: 'dismissed' })).rejects.toThrow('invalid_input')
    expect(invalidate).not.toHaveBeenCalled()
  })
  it('downloads CSV through the bearer route rather than navigating an unauthenticated URL', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { setTimeout })
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { append: vi.fn() } })
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    fetchMock.mockResolvedValueOnce(new Response('worker,regular_hours,ot_hours,premium_hours,gross,held_entries\n', { headers: { 'Content-Type': 'text/csv' } }))
    await downloadBatch('batch-a', '/data/batches/batch-a/csv')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/data/batches/batch-a/csv')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer test-session')
    expect(link.click).toHaveBeenCalledOnce()
    expect(link.download).toBe('payroll-batch-a.csv')
    await vi.runAllTimersAsync()
    expect(revoke).toHaveBeenCalledWith('blob:csv')
    create.mockRestore(); revoke.mockRestore()
  })
})

describe('trace frames and persistence', () => {
  it('reads trace frames independently of text and retains them above the saved message', async () => {
    const frames = [{ trace: 'Read handbooks/send-to-payroll.md' }, { trace: 'Read data/cycles/2026-09-20.json' }, { text: 'Ready for review.' }, { done: true }]
    fetchMock.mockResolvedValueOnce(new Response(frames.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } }))
    let traces: string[] = [], text = ''
    for await (const event of stream('Review Payroll', { page: '/payroll', calendar: {} } as ChatContext)) { traces = appendTrace(traces, event.trace); text += event.text ?? '' }
    const message = { id: 'trace-a', role: 'agent' as const, text, traces, at: 1 }
    const html = renderToStaticMarkup(createElement(Message, { message }))
    expect(html.indexOf('✓ Read handbooks/send-to-payroll.md')).toBeLessThan(html.indexOf('Ready for review.'))
    const saved: unknown[] = []
    const history = createChatHistory({ read: () => [message], apply: vi.fn(), loadPending: () => [], savePending: vi.fn(), request: async (method, body) => {
      if (method === 'POST') saved.push(...body!.messages)
      return response(method === 'GET' ? { messages: [] } : { ok: true })
    } })
    await history.load()
    expect(saved).toEqual([message])
  })
  it('caps data traces at three safe paths while retaining later handbook traces', () => {
    let traces: string[] = []
    for (const trace of ['Read handbooks/a.md', 'Read data/a', 'Read handbooks/a.md', 'Read data/b', 'Read data/c', 'Read data/d', 'Read handbooks/chase-missing-time.md', 'Made up', '<script>']) traces = appendTrace(traces, trace)
    expect(traces).toEqual(['Read handbooks/a.md', 'Read data/a', 'Read data/b', 'Read data/c', 'Read handbooks/chase-missing-time.md'])
  })
})
