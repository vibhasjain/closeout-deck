import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RULES, createEngineContext, runEngine } from '@/bench/engine.js'
import * as api from '@/lib/api'
import * as sessions from '@/lib/viewerSession'
import * as onboarding from '@/lib/onboarding'
import { DEFAULTS } from '@/lib/onboarding'
import { hydrate, invalidate, publishCycle, refreshCycleList, serverCycles, type CyclePayload, type FileRecord } from '@/lib/data'
import { rowResolution } from '@/lib/desk'
import { payTotals } from '@/lib/payroll'
import { resolutionGroups } from '@/lib/resolution'
import recorded from '@/lib/fixtures/server-cycle.json'

const payload = recorded.payload as unknown as CyclePayload
const files = recorded.files as FileRecord[]
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
let sequence = 0
beforeEach(() => {
  vi.spyOn(sessions, 'viewerSession').mockReturnValue({ email: `navigation-${sequence++}@example.com`, sessionToken: 'test', exp: 9999999999 })
  vi.spyOn(onboarding, 'getOnboarding').mockReturnValue(DEFAULTS)
  vi.spyOn(onboarding, 'updateOnboarding').mockImplementation(() => {})
  vi.spyOn(api, 'authedFetch').mockImplementation(path => Promise.resolve(response(path === '/files' ? { files }
    : path === '/data/cycles' ? { cycles: [{ ...payload.cycle, runAt: payload.runAt, sample: payload.sample, totals: payload.totals, counts: payload.counts, findings: payload.groups.length }], sources: recorded.sources }
      : payload)))
})
afterEach(() => vi.restoreAllMocks())

describe('navigation derivations', () => {
  it('hydrates server results without evaluating the engine again and keeps evidence helpers equivalent', () => {
    const evaluate = vi.spyOn(RULES[0], 'evaluate')
    const cycle = hydrate(structuredClone(payload), DEFAULTS, files)
    expect(evaluate).not.toHaveBeenCalled()
    const cloned = cycle.week.map(shift => ({ ...shift }))
    const context = createEngineContext(cloned)
    const expected = runEngine(cloned).ctx
    for (const shift of cloned) {
      expect(context.workedMin(shift)).toBe(expected.workedMin(shift))
      expect(context.dupGap(shift)).toBe(expected.dupGap(shift))
      expect(context.gapSincePrev(shift)).toBe(expected.gapSincePrev(shift))
    }
    expect(context.params('CS-01', 'window_min')).toBe(expected.params('CS-01', 'window_min'))
    expect(createEngineContext(cloned, { 'CS-01.window_min': 3 }).params('CS-01', 'window_min')).toBe(3)
  })

  it('reuses a loaded cycle and its derived groups and payouts when routes, chat, or sidebar state change', async () => {
    await invalidate()
    const original = serverCycles(DEFAULTS)
    const groups = resolutionGroups(original[0], {})
    const totals = payTotals(original[0])
    const otherPane = serverCycles({ ...DEFAULTS, sidebar: 'rail', profile: { notes: 'Updated while reviewing' }, chat: [{ id: 'chat-1', role: 'user', text: 'Open Rules', at: 1 }] })
    expect(otherPane).toBe(original)
    expect(resolutionGroups(otherPane[0], { elsewhere: { entry: 'applied' } })).toBe(groups)
    expect(payTotals(otherPane[0])).toBe(totals)
    await refreshCycleList()
    expect(serverCycles(DEFAULTS)).toBe(original)
  })

  it('updates remembered-rule metadata without rerunning a payload, and replaces results on a new decision', async () => {
    await invalidate()
    const before = serverCycles(DEFAULTS)[0]
    const remembered = serverCycles({ ...DEFAULTS, customRules: [{ id: 'memory', sourceRuleId: 'CS-01', autoApply: true, effectiveCycleStart: '2026-01-01', bucket: 'Custom', kind: 'det', sentence: 'Remember duplicates', source: { doc: 'Review' }, draft: false, at: 1 }] })[0]
    expect(remembered.rememberedRuleIds).toContain('CS-01')
    expect(remembered.run).toBe(before.run)
    const beforeGroups = resolutionGroups(before, {})
    const rule = beforeGroups.find(group => group.state === 'proposed')!
    publishCycle({ ...payload, decisions: [{ id: 'decision-new', cycleId: payload.cycle.id, groupId: rule.ruleId, shiftIds: rule.cases.map(item => item.shiftId), decision: 'approved', reason: null, by: 'user', at: '2026-09-26T12:00:00Z' }] })
    const after = serverCycles(DEFAULTS)[0]
    expect(after).not.toBe(before)
    expect(resolutionGroups(after, {})).not.toBe(beforeGroups)
    expect(resolutionGroups(after, {}).find(group => group.ruleId === rule.ruleId)).toMatchObject({ state: 'fixed', approved: true })
    expect(payTotals(after)).not.toBe(payTotals(before))
  })

  it('invalidates file provenance and isolates accounts while retaining old data during a pending refresh', async () => {
    await invalidate()
    const before = serverCycles(DEFAULTS)[0]
    let finish!: (value: Response) => void
    vi.mocked(api.authedFetch).mockImplementation(path => path === '/files' ? new Promise(resolve => { finish = resolve })
      : Promise.resolve(response(path === '/data/cycles' ? { cycles: [{ ...payload.cycle, runAt: payload.runAt }], sources: recorded.sources } : payload)))
    const refreshing = invalidate()
    expect(serverCycles(DEFAULTS)[0]).toBe(before)
    finish(response({ files: files.map(file => ({ ...file, name: `new-${file.name}` })) }))
    await refreshing
    const updated = serverCycles(DEFAULTS)[0]
    expect(updated).not.toBe(before)
    expect(updated.week[0].prov?.file).toBe(`new-${before.week[0].prov?.file}`)
    vi.mocked(sessions.viewerSession).mockReturnValue({ email: 'other-navigation@example.com', sessionToken: 'other', exp: 9999999999 })
    expect(serverCycles(DEFAULTS).every(cycle => cycle.week.length === 0)).toBe(true)
  })

  it('indexes decisions once for a full cycle and preserves aliases, latest-write order, and held entries', () => {
    const cycle = hydrate(structuredClone(payload), DEFAULTS, files)
    const rule = cycle.groups![0].ruleId
    cycle.groups = [{ ...cycle.groups![0], id: 99 }]
    cycle.decisions = [
      { id: 'b', cycleId: cycle.id, groupId: '99', shiftIds: [], decision: 'approved', reason: null, by: 'user', at: '2026-09-26T12:00:00Z' },
      { id: 'a', cycleId: cycle.id, groupId: rule, shiftIds: [], decision: 'dismissed', reason: 'Older at same timestamp', by: 'user', at: '2026-09-26T12:00:00Z' },
    ]
    const scans = vi.spyOn(cycle.run.shifts, 'find')
    for (let pass = 0; pass < 5; pass++) for (const shift of cycle.run.shifts) {
      expect(rowResolution(cycle, shift.shift.id, rule, {})).toBe(shift.held ? undefined : 'applied')
    }
    expect(scans).not.toHaveBeenCalled()
    cycle.decisions = [...cycle.decisions, { ...cycle.decisions[0], id: 'c', decision: 'escalated', at: '2026-09-26T12:00:01Z' }]
    const shift = cycle.run.shifts.filter(shift => !shift.held)[0]
    expect(rowResolution(cycle, shift.shift.id, rule, {})).toBe('escalated')
  })
})
