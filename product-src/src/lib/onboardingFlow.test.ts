import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { stream } from './chat'
import { DEFAULTS, getOnboarding, updateOnboarding } from './onboarding'
import { applyOnboardReply, finishOnboarding, readFirm, requestOnboarding, uploadOnboardingFiles } from './onboardingFlow'

vi.mock('./chat', async (original) => ({ ...await original<typeof import('./chat')>(), stream: vi.fn() }))
vi.mock('./onboarding', async (original) => ({ ...await original<typeof import('./onboarding')>(), flushOnboarding: vi.fn(async () => {}) }))
vi.mock('./viewerSession', () => ({ viewerSession: () => null, signOut: vi.fn() }))

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  vi.stubGlobal('fetch', vi.fn())
  updateOnboarding(structuredClone(DEFAULTS))
  vi.mocked(stream).mockReset()
})
afterEach(() => vi.unstubAllGlobals())

const valid = 'Could you share that inbox?\n```card\n{"kind":"question","input":"text","topics":["workerHours"],"placeholder":"An email address"}\n```\n```action\n{"type":"cover_topic","topic":"calendar"}\n```'

describe('the agent owns the conversation', () => {
  it('sends current context, uses the authoritative final, and applies validated actions', async () => {
    vi.mocked(stream).mockImplementation(async function* () { yield { text: 'Intermediate text' }; yield { done: true, final: valid, sessionId: 'same-session' } })
    const reply = await requestOnboarding('We get hours by email')
    expect(stream).toHaveBeenCalledWith('We get hours by email', { firm: null, profile: {}, covered: [] }, 'onboard', undefined)
    expect(reply.question).toBe('Could you share that inbox?')
    expect(getOnboarding().covered).toEqual([])
    applyOnboardReply(reply)
    expect(getOnboarding().covered).toEqual(['calendar'])
    expect(getOnboarding().setupHistory[0].question).toBe(reply.question)
    expect(getOnboarding().chatSessionId).toBe('same-session')
  })
  it.each(['No card', '```card\n{"kind":"question","input":"unknown","topics":[]}\n```', valid + '\n```card\n{"kind":"onboard_complete"}\n```', valid + '\n```card\nnot json\n```'])('rejects an invalid reply without a canned question (%s)', async (final) => {
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final } })
    await expect(requestOnboarding('skip')).rejects.toThrow()
    expect(getOnboarding().covered).toEqual([])
    expect(getOnboarding().setupHistory).toEqual([])
  })
  it('keeps an interrupted request retryable and rejects model errors', async () => {
    vi.mocked(stream).mockImplementation(async function* () { yield { text: valid } })
    await expect(requestOnboarding('skip')).rejects.toThrow('connection ended')
    vi.mocked(stream).mockImplementation(async function* () { yield { error: 'CLI unavailable', done: true } })
    await expect(requestOnboarding('skip')).rejects.toThrow('CLI unavailable')
  })
  it('lets the agent complete with enough context and keeps the handoff idempotent', async () => {
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: '```card {"kind":"onboard_complete"}```' } })
    applyOnboardReply(await requestOnboarding('That is enough for now'))
    expect(getOnboarding().setupStep).toBe('writing')
    expect(getOnboarding().forwarded).toBe(false)
    finishOnboarding(['Taylor'])
    finishOnboarding(['Taylor', 'Morgan'])
    expect(getOnboarding().neverContact).toEqual(['Taylor', 'Morgan'])
    expect(getOnboarding().forwarded).toBe(true)
    expect(getOnboarding().chat).toHaveLength(1)
    expect(getOnboarding().chat[0]).toMatchObject({ text: "Let's run last week together.", cards: [{ input: 'choice', choice: { yours: 'Use your timesheets', sample: 'Use sample timesheets' } }] })
  })
})

describe('firm and file intake', () => {
  it('reads sample facts from the same firm endpoint', async () => {
    const firm = { name: 'Sample', states: ['CA', 'TX'], verticals: ['Light industrial'], clientTypes: [], summary: '', size: '', staffing: true }
    vi.mocked(fetch).mockResolvedValue(Response.json({ firm }))
    expect(await readFirm('sample')).toEqual(firm)
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/firm')
    expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBe('{"domain":"sample"}')
  })
  it('uses P5 raw uploads, preserving the filename and set hint', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ file: { id: '1' } }))
    const file = new File(['worker,hours\nA,8'], 'time entries.csv', { type: 'text/csv' })
    expect(await uploadOnboardingFiles([file], undefined, 1)).toEqual(['time entries.csv'])
    expect(fetch).toHaveBeenCalledWith('/api/files', expect.objectContaining({ body: file, headers: expect.objectContaining({ 'X-File-Name': 'time%20entries.csv', 'X-Set': '1' }) }))
  })
  it.each([404, 501])('saves names only when P5 is absent (%i)', async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status }))
    expect(await uploadOnboardingFiles([new File(['a'], 'hours.csv')])).toEqual(['hours.csv'])
  })
  it('does not silently convert an upload failure to names', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 500 }))
    await expect(uploadOnboardingFiles([new File(['a'], 'hours.csv')])).rejects.toThrow('upload failed')
  })
})
