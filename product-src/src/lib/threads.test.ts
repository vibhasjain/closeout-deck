import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Thread } from '@/components/Thread'
import { OverlayProvider } from '@/components/shell/Overlay'
import * as onboarding from '@/lib/onboarding'
import { fmtT, runEngine } from '@/bench/engine.js'
import { buildCycles } from '@/lib/desk'
import { DEFAULTS } from '@/lib/onboarding'
import { defaultThreadParty, generateThread, readThreadInput, recordThreadAction, recordThreadInput, threadFor } from '@/lib/threads'
import type { MediationState, ThreadParty } from '@/lib/threads'

const cycle = buildCycles(DEFAULTS, new Date(2026, 7, 25))[0]
const flagged = cycle.run.shifts.filter((rs) => rs.flagged || rs.held)
const shift = (id: string) => cycle.run.shifts.find((rs) => rs.shift.id === id)!
const reload = (state: MediationState): MediationState => JSON.parse(JSON.stringify(state))

const parties: ThreadParty[] = ['worker', 'facility']
const visibleText = (thread: ReturnType<typeof generateThread>) => [
  ...thread.entries.flatMap((entry) => [entry.subject ?? '', entry.text]),
  thread.draft?.subject ?? '', thread.draft?.text ?? '', thread.need,
  ...thread.trail.map((entry) => entry.detail),
].join(' ')

describe('sample mediation conversations', () => {
  it('provides separately keyed worker and facility conversations for every clean, flagged and held payment', () => {
    expect(cycle.scripted).toBe(true)
    expect(flagged).toHaveLength(78)
    expect(flagged.filter((rs) => rs.held)).toHaveLength(5)
    expect(cycle.run.shifts.some((rs) => !rs.flagged && !rs.held)).toBe(true)
    const ids = new Set<string>()
    for (const rs of cycle.run.shifts) {
      for (const party of parties) {
        const thread = generateThread(cycle, rs, party)
        expect(thread.id).toBe(`${cycle.id}:${rs.shift.id}:${party}`)
        expect(ids.has(thread.id)).toBe(false)
        ids.add(thread.id)
        expect(thread.counterparty).toEqual(party === 'worker'
          ? { kind: 'Worker', name: rs.shift.worker }
          : { kind: 'Facility', name: rs.shift.fac.name })
        expect(thread.channel).toBe(party === 'worker' ? 'SMS' : 'Email')
        if (!rs.flagged && !rs.held) {
          expect(thread.draft).toBeNull()
          expect(thread.trail).toEqual([])
          expect(defaultThreadParty(cycle, rs)).toBe('worker')
        }
      }
    }
  })

  it('seeds identical samples from the same payment and party without mutating the run', () => {
    const before = JSON.stringify(cycle.run.shifts)
    for (const rs of cycle.run.shifts) {
      for (const party of parties) expect(generateThread(cycle, rs, party)).toEqual(generateThread(cycle, rs, party))
      expect(generateThread(cycle, rs, 'worker').entries).not.toEqual(generateThread(cycle, rs, 'facility').entries)
    }
    expect(JSON.stringify(cycle.run.shifts)).toBe(before)
    expect(generateThread(cycle, shift('4839')).draft?.createdAt).not.toBe(generateThread(cycle, shift('4840')).draft?.createdAt)
  })

  it('uses short, human sample messages with real names, sites and dates and no engine language', () => {
    for (const rs of cycle.run.shifts) for (const party of parties) {
      const thread = generateThread(cycle, rs, party)
      expect(thread.entries.length).toBeGreaterThanOrEqual(2)
      expect(thread.entries.length).toBeLessThanOrEqual(rs.flagged || rs.held ? 5 : 3)
      expect(thread.entries.some((entry) => entry.dir === 'out')).toBe(true)
      expect(thread.entries.some((entry) => entry.dir === 'in')).toBe(true)
      expect(thread.entries.every((entry) => entry.dir !== 'internal')).toBe(true)
      const text = visibleText(thread)
      expect(text).toContain(rs.shift.worker)
      expect(text).toContain(rs.shift.fac.name)
      expect(text).toContain(cycle.days[rs.shift.day])
      expect(text).not.toMatch(/\bshifts?\b/i)
      expect(text).not.toMatch(/→|timesheet\.out|discrepancy opened|engine proposes/)
      for (const row of rs.rows) expect(text).not.toContain(row.ruleId)
    }
  })

  it('quotes only clock times present in that payment own punches or schedule', () => {
    for (const rs of cycle.run.shifts) for (const party of parties) {
      const thread = generateThread(cycle, rs, party)
      const ownTimes = new Set([
        ...rs.shift.punches.flatMap((punch) => punch.out == null ? [punch.in] : [punch.in, punch.out]),
        ...(rs.shift.sched ?? []),
      ].map(fmtT))
      const times = thread.entries.flatMap((entry) => entry.text.match(/\b\d{1,2}:\d{2} (?:AM|PM)\b/g) ?? [])
      expect(times.length).toBeGreaterThan(0)
      for (const time of times) expect(ownTimes.has(time), `${thread.id} contains unrecorded ${time}`).toBe(true)
    }
  })

  it('keeps every sample timestamp ordered within its pay cycle, including overnight and final-day records', () => {
    const end = new Date(cycle.end.getFullYear(), cycle.end.getMonth(), cycle.end.getDate() + 1).getTime()
    for (const rs of cycle.run.shifts) for (const party of parties) {
      const thread = generateThread(cycle, rs, party)
      const times = thread.entries.map((entry) => Date.parse(entry.at))
      if (thread.draft) times.push(Date.parse(thread.draft.createdAt))
      for (let index = 0; index < times.length; index++) {
        expect(times[index]).toBeGreaterThanOrEqual(cycle.start.getTime())
        expect(times[index]).toBeLessThan(end)
        if (index) expect(times[index]).toBeGreaterThan(times[index - 1])
      }
      expect(thread.askedAt).toBeUndefined()
      expect(thread.trail.some((event) => event.action === 'sent')).toBe(false)
    }
  })

  it('defaults to the finding recipient and retains a pending draft only for that party', () => {
    for (const rs of flagged) {
      const party = defaultThreadParty(cycle, rs)
      const thread = generateThread(cycle, rs)
      expect(thread).toEqual(generateThread(cycle, rs, party))
      expect(thread.draft).not.toBeNull()
      expect(thread.waitingOn).toBe('Us')
      expect(rs.rows.some((row) => row.ruleId === thread.ruleId && (row.status === 'flag' || row.status === 'held'))).toBe(true)
      const other = generateThread(cycle, rs, party === 'worker' ? 'facility' : 'worker')
      expect(other.draft).toBeNull()
      expect(other.ruleId).toBe('')
      expect(other.trail).toEqual([])
      expect(thread.entries.map((entry) => entry.text).join(' ')).not.toEqual(other.entries.map((entry) => entry.text).join(' '))
    }
    for (const id of ['4821', '4824', '4833', '4834', '4839', '4840', '4841']) expect(defaultThreadParty(cycle, shift(id))).toBe('worker')
    for (const id of ['4825', '4826', '4830', '4835', '4836', '4838']) expect(defaultThreadParty(cycle, shift(id))).toBe('facility')
    expect(generateThread(cycle, shift('4821')).entries[1].text).toContain(fmtT(shift('4821').shift.sched![1]))
    expect(generateThread(cycle, shift('4838')).entries[0].text).toContain('edited after approval')
  })

  it('distinguishes a missing waiver document from a missing meal on a longer workday', () => {
    const original = shift('4826').shift
    const waiverShift = { ...original, punches: [{ in: 360, out: 690 }], geo: [355, 695] as [number, number], meal: null, waiverOnFile: false }
    const run = runEngine([waiverShift])
    const thread = generateThread({ ...cycle, run }, run.shifts[0])
    expect(thread.ruleId).toBe('CA-MB-01')
    expect(thread.counterparty.kind).toBe('Facility')
    expect(thread.draft!.text).toContain('signed meal waiver')
    expect(thread.entries[0].text).toContain('signed meal waiver')
    const longRun = runEngine([{ ...waiverShift, punches: [{ in: 360, out: 870 }], fac: { ...waiverShift.fac, autoDeduct: false } }])
    const longThread = generateThread({ ...cycle, run: longRun }, longRun.shifts[0])
    expect(longThread.ruleId).toBe('CA-MB-01')
    expect(longThread.counterparty.kind).toBe('Worker')
  })

  it('skips remembered findings while preserving remaining open-finding priority', () => {
    const rs = shift('4836')
    expect(defaultThreadParty(cycle, rs)).toBe('facility')
    const remembered = { ...cycle, rememberedRuleIds: ['CON-MIN-4H'] }
    expect(defaultThreadParty(remembered, rs)).toBe('worker')
    expect(generateThread(remembered, rs).ruleId).toBe('CA-RT-01')
    const allRemembered = { ...cycle, rememberedRuleIds: rs.rows.map((row) => row.ruleId) }
    for (const party of parties) expect(generateThread(allRemembered, rs, party).draft).toBeNull()
    expect(defaultThreadParty(allRemembered, rs)).toBe('worker')
  })
})

describe('persisted mediation actions', () => {
  const rs = shift('4839')
  const at = '2026-08-31T14:00:00.000Z'

  it('keeps sent messages, pending drafts and unsent inputs separate by payment and party after reload', () => {
    const worker = generateThread(cycle, rs, 'worker')
    const facility = generateThread(cycle, rs, 'facility')
    const clean = cycle.run.shifts.find((payment) => !payment.flagged && !payment.held)!
    const cleanWorker = generateThread(cycle, clean, 'worker')
    const mediation: Record<string, MediationState> = {
      [worker.id]: recordThreadInput(recordThreadAction(undefined, { type: 'send', text: 'Worker follow-up.', at, draft: true }), 'Worker unsent.'),
      [facility.id]: recordThreadInput(recordThreadAction(undefined, { type: 'send', text: 'Facility follow-up.', at }), 'Facility unsent.'),
      [cleanWorker.id]: recordThreadAction(undefined, { type: 'send', text: 'A new conversation.', at }),
    }
    const restored: Record<string, MediationState> = JSON.parse(JSON.stringify(mediation))
    for (const [party, text, input] of [['worker', 'Worker follow-up.', 'Worker unsent.'], ['facility', 'Facility follow-up.', 'Facility unsent.']] as const) {
      const key = generateThread(cycle, rs, party).id
      const thread = threadFor(cycle, rs, restored[key], party)
      expect(thread.entries.filter((entry) => entry.id.includes('-sent-')).map((entry) => entry.text)).toEqual([text])
      expect(readThreadInput(restored[key])).toBe(input)
      expect(thread.draft).toBeNull()
    }
    expect(threadFor(cycle, clean, restored[cleanWorker.id], 'worker').entries.at(-1)?.text).toBe('A new conversation.')
    expect(threadFor(cycle, clean, restored[generateThread(cycle, clean, 'facility').id], 'facility').entries).toEqual(generateThread(cycle, clean, 'facility').entries)
    expect(generateThread(cycle, rs, 'worker').draft).not.toBeNull()
  })

  it('restores edited drafts and revised trail entries after JSON reload', () => {
    const text = 'Please confirm whether the recorded 01:12 clock-out is correct.\nThank you.'
    const saved = recordThreadAction(undefined, { type: 'edit', text, at })
    const thread = threadFor(cycle, rs, reload(saved))!
    expect(thread.draft!.text).toBe(text)
    expect(thread.trail.at(-1)).toEqual({ at, action: 'revised', detail: 'Draft revised' })
    expect(generateThread(cycle, rs)!.draft!.text).not.toBe(text)
  })

  it('sends an edited draft once, clears it, and restores the sent text, timestamp and trail', () => {
    const edited = recordThreadAction(undefined, { type: 'edit', text: 'What time did you finish?', at })
    const sentAt = '2026-08-31T14:05:00.000Z'
    const sent = recordThreadAction(edited, { type: 'send', text: edited.edited!, at: sentAt, draft: true })
    expect(edited.sent).toEqual([])
    expect(edited.dismissedDraft).toBeUndefined()
    const thread = threadFor(cycle, rs, reload(sent))!
    expect(thread.draft).toBeNull()
    expect(thread.entries.filter((entry) => entry.id.includes('-sent-'))).toHaveLength(1)
    expect(thread.entries.at(-1)).toMatchObject({ dir: 'out', at: sentAt, text: edited.edited, subject: generateThread(cycle, rs)!.draft!.subject })
    expect(thread.waitingOn).toBe('Worker')
    expect(thread.askedAt).toBe(sentAt)
    expect(thread.trail.map((event) => event.action)).toEqual(['ingested', 'drafted', 'revised', 'sent'])
  })

  it('preserves an unrelated pending draft when composing by hand and retains repeated messages', () => {
    const one = recordThreadAction(undefined, { type: 'send', text: 'Please check this payment.', at })
    const two = recordThreadAction(one, { type: 'send', text: 'Please check this payment.', at: '2026-08-31T15:00:00.000Z' })
    const thread = threadFor(cycle, rs, reload(two))!
    expect(thread.draft).not.toBeNull()
    expect(thread.entries.filter((entry) => entry.id.includes('-sent-')).map((entry) => entry.at)).toEqual([at, '2026-08-31T15:00:00.000Z'])
    expect(thread.askedAt).toBe('2026-08-31T15:00:00.000Z')
    expect(thread.trail.filter((event) => event.action === 'sent')).toHaveLength(2)
  })

  it('persists not needed without claiming a message was sent or erasing previous sends', () => {
    const sent = recordThreadAction(undefined, { type: 'send', text: 'Please check.', at })
    const dismissed = recordThreadAction(sent, { type: 'dismiss', at })
    const thread = threadFor(cycle, rs, reload(dismissed))!
    expect(thread.draft).toBeNull()
    expect(thread.entries.at(-1)?.text).toBe('Please check.')
    expect(thread.trail.at(-1)).toEqual({ at, action: 'status', detail: 'Draft marked not needed' })
    expect(thread.trail.filter((event) => event.action === 'sent')).toHaveLength(1)
  })

  it('ignores malformed action metadata and rejects empty messages or invalid timestamps', () => {
    const thread = threadFor(cycle, rs, { sent: [], notes: ['not json', '{}', '{"v":1,"type":"send","at":"bad","text":"false history"}', JSON.stringify({ v: 1, type: 'send', text: 'No corresponding sent message', at, sentIndex: 0 })] })!
    expect(thread.entries).toEqual(generateThread(cycle, rs)!.entries)
    expect(thread.trail).toEqual(generateThread(cycle, rs)!.trail)
    expect(recordThreadAction(undefined, { type: 'send', text: ' ', at }).sent).toEqual([])
    expect(recordThreadAction(undefined, { type: 'send', text: 'Confirm time', at: 'bad' }).sent).toEqual([])
  })

  it('restores sent message bodies even when no timestamp metadata was recorded', () => {
    const thread = threadFor(cycle, rs, { sent: ['Please confirm your clock-out.'] })!
    expect(thread.entries.at(-1)).toMatchObject({ dir: 'out', at: '', text: 'Please confirm your clock-out.' })
    expect(thread.trail.at(-1)).toMatchObject({ action: 'sent', at: '' })
    expect(thread.waitingOn).toBe('Worker')
    expect(thread.askedAt).toBeUndefined()
  })

  it('keeps only the latest unsent composer snapshot across reload without changing sent messages or the trail', () => {
    const sent = recordThreadAction(undefined, { type: 'send', text: 'First request.', at })
    const editing = recordThreadAction(sent, { type: 'edit', text: 'Edited pending draft.', at })
    const one = recordThreadInput(editing, 'Please')
    const two = recordThreadInput(one, 'Please confirm the time.\nThank you.')
    const restored = reload(two)
    expect(readThreadInput(restored)).toBe('Please confirm the time.\nThank you.')
    expect(restored.notes).toHaveLength(3)
    expect(restored.sent).toEqual(['First request.'])
    expect(restored.edited).toBe('Edited pending draft.')
    expect(threadFor(cycle, rs, restored)?.trail).toEqual(threadFor(cycle, rs, editing)?.trail)
    expect(readThreadInput(one)).toBe('Please')
    const cleared = recordThreadInput(restored, '')
    expect(readThreadInput(reload(cleared))).toBe('')
    expect(cleared.notes).toEqual(editing.notes)
    expect(readThreadInput()).toBe('')
  })
})

describe('conversation rendering', () => {
  afterEach(() => { vi.restoreAllMocks() })

  function renderConversation(rs: (typeof cycle.run.shifts)[number], query = '', patch: Partial<typeof DEFAULTS> = {}) {
    vi.spyOn(onboarding, 'useOnboarding').mockReturnValue([{ ...DEFAULTS, ...patch }, vi.fn()])
    return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/payroll/${rs.shift.id}${query}`] },
      h(OverlayProvider, null, h(Thread, { cycle, rs }))))
  }

  it('renders both recipient options and an available composer for clean and flagged payments', () => {
    const clean = cycle.run.shifts.find((rs) => !rs.flagged && !rs.held)!
    for (const rs of [clean, shift('4839')]) {
      for (const party of ['worker', 'facility'] as const) {
        const html = renderConversation(rs, `?with=${party}`)
        expect(html).not.toContain(`class="thread-title"`)
        expect(html).toContain('aria-label="Conversation recipient"')
        expect(html).toContain(`aria-pressed="true">${party === 'worker' ? 'Worker' : 'Facility'}</button>`)
        expect(html).toContain('class="chat-input"')
        expect(html.match(/class="thread-bubble /g)).toHaveLength(generateThread(cycle, rs, party).entries.length)
        expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/\bshifts?\b/i)
        expect(html).not.toContain('thread-rationale')
        expect(html).not.toContain('thread-need')
      }
    }
  })

  it('defaults to the open finding recipient, respects URL overrides, and defaults clean payments to Worker', () => {
    const rs = shift('4825')
    expect(renderConversation(rs)).toContain('aria-pressed="true">Facility</button>')
    expect(renderConversation(rs, '?with=invalid')).toContain('aria-pressed="true">Facility</button>')
    expect(renderConversation(rs, '?with=worker')).toContain('aria-pressed="true">Worker</button>')
    const clean = cycle.run.shifts.find((payment) => !payment.flagged && !payment.held)!
    expect(renderConversation(clean)).toContain('aria-pressed="true">Worker</button>')
  })

  it('restores each party’s messages and composer independently, with a draft only for the relevant recipient', () => {
    const rs = shift('4839')
    const workerKey = `${cycle.id}:${rs.shift.id}:worker`
    const facilityKey = `${cycle.id}:${rs.shift.id}:facility`
    const at = '2026-08-31T14:00:00.000Z'
    const mediation = {
      [workerKey]: recordThreadInput(recordThreadAction(undefined, { type: 'send', text: 'Worker-only sent message', at }), 'Worker-only unsent message'),
      [facilityKey]: recordThreadInput(recordThreadAction(undefined, { type: 'send', text: 'Facility-only sent message', at }), 'Facility-only unsent message'),
    }
    const worker = renderConversation(rs, '?with=worker', { mediation })
    const facility = renderConversation(rs, '?with=facility', { mediation })
    for (const [html, own, other] of [[worker, 'Worker', 'Facility'], [facility, 'Facility', 'Worker']]) {
      expect(html).toContain(`${own}-only sent message`)
      expect(html).toContain(`${own}-only unsent message`)
      expect(html).not.toContain(`${other}-only`)
    }
    expect(worker).toContain('aria-label="Pending outbound draft"')
    expect(facility).not.toContain('aria-label="Pending outbound draft"')
  })

  it('keeps legacy correspondence with its original party after a decision, without a new pending draft', () => {
    const rs = shift('4825')
    const mediation = { [`${cycle.id}:${rs.shift.id}`]: { sent: ['Earlier facility correspondence'] } }
    const patch = { mediation, resolutions: { [cycle.id]: { [rs.shift.id]: 'dismissed' as const } } }
    const worker = renderConversation(rs, '', patch)
    expect(worker).toContain('aria-pressed="true">Worker</button>')
    expect(worker).not.toContain('Earlier facility correspondence')
    expect(worker).not.toContain('aria-label="Pending outbound draft"')
    const facility = renderConversation(rs, '?with=facility', patch)
    expect(facility).toContain('Earlier facility correspondence')
    expect(facility).not.toContain('aria-label="Pending outbound draft"')
    expect(facility).toContain('class="chat-input"')
  })
})
