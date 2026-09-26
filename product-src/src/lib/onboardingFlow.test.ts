import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { stream } from './chat'
import { ASK_FIRST, DEFAULTS, flushOnboarding, getOnboarding, inboxAddress, updateOnboarding } from './onboarding'
import { applyOnboardReply, finishOnboarding, readFirm, requestOnboarding, rollbackOnboardingAnswer, uploadOnboardingFiles } from './onboardingFlow'
import { actionSummary } from './chatActions'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileCard } from '@/components/profile/ProfileCard'
import { split } from './agentOnboarding'
import type { Finding } from './sample'

vi.mock('./chat', async (original) => ({ ...await original<typeof import('./chat')>(), stream: vi.fn() }))
vi.mock('./onboarding', async (original) => ({ ...await original<typeof import('./onboarding')>(), flushOnboarding: vi.fn(async () => {}) }))
vi.mock('./viewerSession', () => ({ viewerSession: () => null, expireSession: vi.fn() }))
const data = vi.hoisted(() => ({ sources: [] as { set: 1 | 2 | 3 }[], counts: { set1: 0, set2: 0, set3: 0 } }))
vi.mock('./data', async (original) => ({ ...await original<typeof import('./data')>(), loadData: vi.fn(async () => {}),
  getDataSnapshot: () => ({ sources: data.sources, list: [{ id: '2026-09-20', counts: data.counts }] }) }))

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  vi.stubGlobal('fetch', vi.fn())
  updateOnboarding(structuredClone(DEFAULTS))
  vi.mocked(stream).mockReset()
  data.sources = []
  data.counts = { set1: 0, set2: 0, set3: 0 }
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
    expect(getOnboarding().setupNotice).toBe("I couldn't save part of that. I'll try again with your next answer.")
    expect(getOnboarding().setupNotice).not.toMatch(/set_profile|Skipped/)
    expect(getOnboarding().setupRequest).toBeNull()
    expect(stream).toHaveBeenCalledTimes(1)
    // The next answer carries the correction to the agent; the user never sees raw action names.
    await requestOnboarding('Next answer')
    expect(vi.mocked(stream).mock.calls[1][0]).toMatch(/^Next answer\n\nApp note: .*set_profile/)
    await requestOnboarding('Another answer')
    expect(vi.mocked(stream).mock.calls[2][0]).toBe('Another answer')
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
    data.sources = [{ set: 1 }]
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
  it('D5: source plans are not data, so every set without loaded time entries gets its own choice card', async () => {
    updateOnboarding({ sources: [{ set: 1, kind: 'sheet', label: 'Texted hours' }, { set: 2, kind: 'system', label: 'Client VMS exports' }] })
    const cards = [1, 2, 3].map((set) => ({ kind: 'question', input: 'choice', set, topics: [], choice: { yours: `Yours for set ${set}`, sample: `Sample set ${set}` } }))
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: 'No time entries are in yet.\n' + cards.map((card) => '```card ' + JSON.stringify(card) + '```').join('\n') } })
    await finishOnboarding([])
    expect(vi.mocked(stream).mock.calls[0][1]).toMatchObject({ phase: 'first_closeout', missingSets: [1, 2, 3] })
    expect(getOnboarding().chat.find(message => message.id === 'onboard-first-closeout')?.cards).toHaveLength(3)
  })
  it('D5: a set counts as loaded from its entries even before a source row exists', async () => {
    data.counts = { set1: 0, set2: 812, set3: 0 }
    vi.mocked(stream).mockImplementation(async function* () { yield { done: true, final: 'Bring the rest.\n```card {"kind":"task","cycleId":"2026-09-20"}```' } })
    await finishOnboarding([])
    expect(vi.mocked(stream).mock.calls[0][1]).toMatchObject({ missingSets: [1, 3] })
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
  it('D4: an explicit answer to the authority goal is consent and saves the stated limit', () => {
    const answer = 'Fix anything up to $100 per entry on your own. Ask me before fixing anything over $100.'
    updateOnboarding({ setupHistory: [{ question: 'What should I be allowed to do on my own?', card: { kind: 'question', input: 'text', topics: ['authority'] }, answer }] })
    applyOnboardReply({ question: 'I will fix time entries up to $100 on my own and ask you before anything bigger', card: { kind: 'onboard_complete' },
      actions: [{ type: 'set_authority', patch: { autoFix: true, limit: 100 } }, { type: 'cover_topic', topic: 'authority' }] })
    const state = getOnboarding()
    // Owner decision: "ask before anything over $100" sets no weekly total, so no cap is invented; the Rulebook may offer one.
    expect(state).toMatchObject({ authorityConfigured: true, authority: { autoFix: true, limit: 100, weeklyCap: null, textSupervisors: false, textWorkers: false } })
    expect(state.authoritySuggestion).toEqual({ weeklyCap: DEFAULTS.authority.weeklyCap })
    const closing = state.chat.find((message) => message.id === 'onboard-closing')!
    expect(closing.actions!.map(actionSummary)).toContain('Saved: Fix up to $100 per entry without asking')
    expect(closing.actions!.map(actionSummary).join(' ')).not.toMatch(/Suggested|reviewed/)
    expect(closing.skipped).toBeUndefined()
  })
  it('D4: an amount the user never said stays a suggestion for the Rulebook', () => {
    updateOnboarding({ setupHistory: [{ question: 'Limits?', card: { kind: 'question', input: 'text', topics: ['authority'] }, answer: 'Fix up to $100 on your own.' }] })
    applyOnboardReply({ question: 'Next?', card: { kind: 'question', input: 'text', topics: ['complaints'] }, actions: [{ type: 'set_authority', patch: { autoFix: true, limit: 100, weeklyCap: 5000 } }] })
    expect(getOnboarding()).toMatchObject({ authorityConfigured: true, authority: { autoFix: true, limit: 100, weeklyCap: null }, authoritySuggestion: { weeklyCap: 5000 } })
  })
  it('owner decision: a $0 weekly cap from the model is never saved, and the profile names no weekly cap', () => {
    const answer = 'Fix anything up to $100 per entry on your own. Ask me before fixing anything over $100.'
    updateOnboarding({ setupHistory: [{ question: 'What can I fix on my own?', card: { kind: 'question', input: 'text', topics: ['authority'] }, answer }] })
    applyOnboardReply({ question: 'Done', card: { kind: 'onboard_complete' }, actions: [{ type: 'set_authority', patch: { autoFix: true, limit: 100, weeklyCap: 0 } }] })
    const state = getOnboarding()
    expect(state.authority).toMatchObject({ autoFix: true, limit: 100, weeklyCap: null })
    const closing = state.chat.find((message) => message.id === 'onboard-closing')!
    expect(closing.actions!.map(actionSummary).join(' ')).not.toMatch(/weekly|\$0/)
    const card = renderToStaticMarkup(createElement(ProfileCard, { state }))
    expect(card).toContain('Up to $100 per entry')
    expect(card).not.toMatch(/per week|weekly/i)
  })
  it('weekly cap, decided: a $100 limit with no stated cap stores no cap, a $90 fix goes through, a $110 fix asks, and no weekly figure is shown', () => {
    const answer = 'Fix anything up to $100 per entry on your own. Ask me before fixing anything over $100.'
    updateOnboarding({ setupHistory: [{ question: 'What can I fix on my own?', card: { kind: 'question', input: 'text', topics: ['authority'] }, answer }] })
    applyOnboardReply({ question: 'I will fix time entries up to $100 on my own and ask you before anything bigger', card: { kind: 'onboard_complete' }, actions: [{ type: 'set_authority', patch: { autoFix: true, limit: 100 } }] })
    const state = getOnboarding()
    // Stored value: no cap. The suggested $1,000 is only an optional Rulebook suggestion.
    expect(state.authority).toMatchObject({ autoFix: true, limit: 100, weeklyCap: null })
    expect(state.authoritySuggestion).toEqual({ weeklyCap: DEFAULTS.authority.weeklyCap })
    // The authority check: a $90 fix is allowed, a $110 fix asks, and no weekly total ever blocks one.
    const finding = (id: number, delta: number) => ({ id, tag: 'Meal break', title: 'Meal break', deadline: 'payroll' as const, sources: [], dispute: 'Worker dispute' as const, summary: '', why: '', hoursLabel: '', amount: delta, amountLabel: '', action: '',
      cases: [{ delta }] as unknown as Finding['cases'] })
    const small = finding(1, 90), large = finding(2, 110), many = Array.from({ length: 30 }, (_, index) => finding(10 + index, 90))
    const checked = split([small, large, ...many], state.authority)
    expect(checked.fixed).toContain(small)
    expect(checked.fixed).toEqual(expect.arrayContaining(many))
    expect(checked.stopped).toEqual([{ finding: large, why: 'Over $100' }])
    // Legacy or missing caps read as no cap, never as $0.
    for (const weeklyCap of [0, undefined] as unknown as (number | null)[]) expect(split([small], { ...state.authority, weeklyCap }).fixed).toEqual([small])
    // The profile and the closing line state no weekly figure.
    for (const html of [renderToStaticMarkup(createElement(ProfileCard, { state })), state.chat.find((message) => message.id === 'onboard-closing')!.actions!.map(actionSummary).join(' '), state.setupClosing ?? '']) {
      expect(html).not.toMatch(/week|\$1,000|\$0\b/i)
    }
  })
  it('D4: widening outside an answer to the authority goal stays a suggestion', () => {
    updateOnboarding({ setupHistory: [{ question: 'Who approves hours?', card: { kind: 'question', input: 'text', topics: ['clientHours'] }, answer: 'The client portal, $100 at a time' }] })
    applyOnboardReply({ question: 'Next?', card: { kind: 'question', input: 'text', topics: ['rates'] }, actions: [{ type: 'set_authority', patch: { autoFix: true, limit: 100 } }] })
    expect(getOnboarding()).toMatchObject({ authorityConfigured: false, authoritySuggestion: { autoFix: true, limit: 100 } })
    expect(actionSummary({ type: 'set_authority', patch: { autoFix: true, limit: 100 } })).toBe('Suggested: Fix up to $100 per entry without asking · confirm it in the Rulebook')
  })
  it('D13: the profile never records an arrangement the user did not describe', () => {
    updateOnboarding({ setupHistory: [{ question: 'How do workers report their time?', card: { kind: 'question', input: 'text', topics: ['workerHours'] }, answer: 'Workers text their hours to their recruiter at the end of each shift.' }] })
    applyOnboardReply({ question: 'Whose hours do you pay?', card: { kind: 'question', input: 'text', topics: ['whoseHours'] }, actions: [
      { type: 'set_profile', field: 'workerHours', value: 'Texted to recruiters; recruiters forward screenshots to me' },
      { type: 'add_source', set: 1, kind: 'email', label: 'Worker texts to recruiters (screenshots)' },
      { type: 'add_source', set: 1, kind: 'sheet', label: 'Worker texts to recruiters' },
      { type: 'cover_topic', topic: 'workerHours' },
    ] })
    expect(getOnboarding().profile.workerHours).toBeUndefined()
    expect(getOnboarding().sources).toEqual([{ set: 1, kind: 'sheet', label: 'Worker texts to recruiters' }])
    expect(getOnboarding().covered).toEqual(['workerHours'])
    expect(getOnboarding().setupNotice).toBe("I couldn't save part of that. I'll try again with your next answer.")
  })
  it('D13: an arrangement the user agreed to is recorded', () => {
    updateOnboarding({ setupHistory: [{ question: 'Can your recruiters forward the text screenshots to me?', card: { kind: 'question', input: 'chips', topics: ['workerHours'] }, answer: 'Yes' }] })
    applyOnboardReply({ question: 'Next?', card: { kind: 'question', input: 'text', topics: ['clientHours'] }, actions: [{ type: 'set_profile', field: 'workerHours', value: 'Recruiters forward text screenshots to me' }] })
    expect(getOnboarding().profile.workerHours).toBe('Recruiters forward text screenshots to me')
  })
  it('D4 run 4: a later "ask me before any contact" keeps the $100 limit the user already gave', () => {
    const limit = 'Ask me before fixing anything over $100. Anything up to $100 per entry you can fix on your own.'
    updateOnboarding({ setupHistory: [{ question: 'Should I ask before every fix, or fix small gaps up to a limit?', card: { kind: 'question', input: 'text', topics: ['authority'] }, answer: limit }] })
    applyOnboardReply({ question: 'And contacting supervisors or workers?', card: { kind: 'question', input: 'text', topics: ['authority'] },
      actions: [{ type: 'set_authority', patch: { autoFix: true, limit: 100 } }] })
    const history = getOnboarding().setupHistory
    updateOnboarding({ setupHistory: [...history.slice(0, -1), { ...history.at(-1)!, answer: 'Ask me before any contact.' }] })
    applyOnboardReply({ question: 'All set.', card: { kind: 'onboard_complete' }, actions: [{ type: 'set_authority', patch: { autoFix: false, limit: 0, textSupervisors: false, textWorkers: false } }] })
    expect(getOnboarding()).toMatchObject({ authorityConfigured: true, authority: { autoFix: true, limit: 100, weeklyCap: null, textSupervisors: false, textWorkers: false } })
  })
  it('a bare "ask me first" still restricts fixing and contact', () => {
    updateOnboarding({ authorityConfigured: true, authority: { ...ASK_FIRST, autoFix: true, limit: 100, textSupervisors: true },
      setupHistory: [{ question: 'Anything else about limits?', card: { kind: 'question', input: 'text', topics: ['authority'] }, answer: 'Actually, ask me first.' }] })
    applyOnboardReply({ question: 'All set.', card: { kind: 'onboard_complete' }, actions: [] })
    expect(getOnboarding().authority).toMatchObject({ autoFix: false, limit: 0, textSupervisors: false, textWorkers: false })
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
