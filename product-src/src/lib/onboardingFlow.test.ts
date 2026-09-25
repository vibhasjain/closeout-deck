import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { stream } from './chat'
import { ASK_FIRST, DEFAULTS, flushOnboarding, getOnboarding, inboxAddress, updateOnboarding } from './onboarding'
import { applyOnboardReply, finishOnboarding, readFirm, requestOnboarding, rollbackOnboardingAnswer, uploadOnboardingFiles } from './onboardingFlow'

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
    expect(stream).toHaveBeenCalledWith('We get hours by email', { firm: null, profile: {}, covered: [], sources: [], inbox: inboxAddress(null), authority: ASK_FIRST, authorityConfigured: false }, 'onboard', undefined)
    expect(reply.question).toBe('Could you share that inbox?')
    expect(getOnboarding().covered).toEqual([])
    applyOnboardReply(reply)
    expect(getOnboarding().covered).toEqual(['calendar'])
    expect(getOnboarding().setupHistory[0].question).toBe(reply.question)
    expect(getOnboarding().chatSessionId).toBe('same-session')
  })
  it.each(['No card', '```card\n{"kind":"question","input":"unknown","topics":[]}\n```'])('rejects an invalid reply without a canned question (%s)', async (final) => {
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
  it('applies valid actions and a valid card beside invalid actions and cards without retrying', async () => {
    const final = valid + '\n```action {"type":"set_profile","field":"unknown","value":"No"}```\n```card not-json```'
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final } })
    applyOnboardReply(await requestOnboarding('We get email'))
    expect(getOnboarding().covered).toEqual(['calendar'])
    expect(getOnboarding().setupHistory).toHaveLength(1)
    expect(getOnboarding().setupNotice).toBe('Skipped: set_profile, card.')
    expect(getOnboarding().setupRequest).toBeNull()
    expect(stream).toHaveBeenCalledTimes(1)
  })
  it('keeps sending if an unrelated profile flush fails', async () => {
    vi.mocked(flushOnboarding).mockRejectedValueOnce(new Error('state too large'))
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: valid } })
    expect((await requestOnboarding('Continue')).card.kind).toBe('question')
  })
  it('replaces a malformed card retry with a corrective request and preserves valid edits', async () => {
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: '```action {"type":"never_contact","name":"Pat"}```\n```card {invalid}```' } })
    await expect(requestOnboarding('My original answer')).rejects.toThrow('last card was unreadable')
    expect(getOnboarding().neverContact).toEqual(['Pat'])
    expect(getOnboarding().setupRequest).toContain('valid actions were saved')
    expect(getOnboarding().setupRequest).not.toBe('My original answer')
  })
  it('does not treat a previously forwarded account as finished during a new setup conversation', async () => {
    updateOnboarding({ forwarded: true })
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: valid } })
    applyOnboardReply(await requestOnboarding('Start onboarding'))
    expect(getOnboarding().forwarded).toBe(false)
  })
  it('stores the actual closing line and generates each missing-set kickoff choice in the same session', async () => {
    const closing = 'I will ask before every fix. Jordan stays off limits.'
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: closing + '\n```card {"kind":"onboard_complete"}```', sessionId: 'same-session' } })
    applyOnboardReply(await requestOnboarding('That is enough for now'))
    expect(getOnboarding()).toMatchObject({ setupStep: 'writing', setupClosing: closing, forwarded: false })
    expect(getOnboarding().chat[0].text).toBe(closing)
    updateOnboarding({ sources: [{ set: 1, kind: 'email', label: 'Worker emails' }] })
    const cards = [2, 3].map((set) => ({ kind: 'question', input: 'choice', set, topics: [], choice: { yours: `Connect set ${set}`, sample: `Sample set ${set}` } }))
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: 'I have worker hours. Bring client and location time next.\n' + cards.map((card) => '```card ' + JSON.stringify(card) + '```').join('\n'), sessionId: 'same-session' } })
    await finishOnboarding(['Taylor'])
    await finishOnboarding(['Taylor', 'Morgan'])
    expect(stream).toHaveBeenCalledTimes(2)
    expect(vi.mocked(stream).mock.calls[1][1]).toMatchObject({ phase: 'first_closeout', missingSets: [2, 3], sources: [{ set: 1, kind: 'email', label: 'Worker emails' }], inbox: inboxAddress(null) })
    expect(getOnboarding()).toMatchObject({ neverContact: ['Taylor', 'Morgan'], forwarded: true, chatSessionId: 'same-session' })
    expect(getOnboarding().chat).toHaveLength(2)
    expect(getOnboarding().chat[1]).toMatchObject({ text: 'I have worker hours. Bring client and location time next.', cards })
  })
  it('has no scripted kickoff text or client-authored kickoff card', () => {
    const source = readFileSync(new URL('./onboardingFlow.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/Let.s run last week together|Use your timesheets|Use sample timesheets/)
    expect(source.slice(source.indexOf('export async function finishOnboarding'))).not.toMatch(/kind: ['"]question/)
  })
  it('accepts a task-card handoff for an empty new account so its inline missing-set choices can collect intake', async () => {
    const task = { kind: 'task', cycleId: '2026-09-20' }
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: 'Choose how to bring in your time entries.\n```card ' + JSON.stringify(task) + '```' } })
    await finishOnboarding([])
    expect(getOnboarding()).toMatchObject({ forwarded: true, setupStep: 'ready', kickoffPending: false })
    expect(getOnboarding().chat.find(message => message.id === 'onboard-first-closeout')?.cards).toEqual([task])
    expect(vi.mocked(stream).mock.calls[0][1]).toMatchObject({ missingSets: [1, 2, 3] })
  })
  it('undoes superseded source and rule effects while retaining independent changes', () => {
    updateOnboarding({ setupHistory: [{ question: 'Where do hours come from?', card: { kind: 'question', input: 'text', topics: ['workerHours'] }, answer: 'Email' }] })
    applyOnboardReply({ question: 'Who approves?', card: { kind: 'question', input: 'text', topics: ['clientHours'] }, actions: [
      { type: 'add_source', set: 1, kind: 'email', label: 'Old inbox' }, { type: 'add_rule', sentence: 'Ask Pat about email gaps' },
    ] })
    updateOnboarding({ sources: [...getOnboarding().sources, { set: 3, kind: 'location', label: 'Independent GPS' }] })
    rollbackOnboardingAnswer(0)
    expect(getOnboarding().sources).toEqual([{ set: 3, kind: 'location', label: 'Independent GPS' }])
    expect(getOnboarding().customRules).toEqual([])
  })
  it('records an explicit ask-first authority answer as restrictive consent', () => {
    updateOnboarding({ setupHistory: [{ question: 'What may I do myself?', card: { kind: 'question', input: 'text', topics: ['authority'] }, answer: 'Ask before every fix and spend nothing.' }] })
    applyOnboardReply({ question: 'All set.', card: { kind: 'onboard_complete' }, actions: [{ type: 'set_authority', patch: { autoFix: true, limit: 1000 } }] })
    expect(getOnboarding()).toMatchObject({ authority: ASK_FIRST, authorityConfigured: true, authoritySuggestion: null })
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
