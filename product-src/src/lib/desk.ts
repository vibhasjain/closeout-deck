import { useMemo } from 'react'
import { FACILITIES, RULES, dayLabels, makeWeek, money, runEngine } from '@/bench/engine.js'
import type { Row, Run, RunShift, Shift } from '@/bench/engine.js'
import { sourceFor } from '@/bench/vendors'
import { cycleLabel, cycleWeeks, recentCycles } from '@/lib/cycles'
import type { Cycle } from '@/lib/cycles'
import { getOnboarding, updateOnboarding, useOnboarding } from '@/lib/onboarding'
import { sampleCycle } from '@/lib/sample'
import type { Onboarding } from '@/lib/onboarding'
import { serverCycles, useData, getDataSnapshot, type CyclePayload, type DataProvenance, type DataSite } from '@/lib/data'
import { viewerSession } from '@/lib/viewerSession'
import type { JourneyDecision, JourneyBatch, NextStep } from '@/lib/journey'
import { payTotals } from '@/lib/payroll'

export type DeskShift = Shift & { prov?: DataProvenance; sample?: boolean }
export interface DeskCycle extends Cycle {
  server?: boolean
  sample?: boolean
  sites?: DataSite[]
  groups?: CyclePayload['groups']
  extraGroups?: CyclePayload['extraGroups']
  gaps?: CyclePayload['gaps']
  intake?: CyclePayload['intake']
  rulesChecked?: CyclePayload['rulesChecked']
  decisions?: JourneyDecision[]
  adjustments?: CyclePayload['adjustments']
  batch?: JourneyBatch | null
  nextStep?: NextStep
  week: DeskShift[]
  run: Run
  days: string[]
  scripted: boolean
  label: string
  statusTag: 'In Progress' | 'Pending' | 'Paid' | 'Approved'
  rememberedRuleIds?: string[]
}

export interface Discrepancy {
  cycleId: string
  shiftId: string
  worker: string
  ruleId: string
  status: 'flag' | 'held' | 'applied'
  note: string
  effect: number
  decided?: 'applied' | 'dismissed' | 'escalated'
}

export interface Kind {
  ruleId: string
  label: string
  recommendation: string
  insight?: string
  impact: number
  agentResolved: number
  needsReview: number
  sentence: string
  bucket: string
  cases: Discrepancy[]
  over: number
  under: number
  wouldDo: string
  whyStopped: string
}

export interface Provenance extends DataProvenance { system: string; fileId?: string; sample?: boolean }

let cached: { hash: string; currentId: string; cycles: DeskCycle[] } | undefined

export function buildCycles(cal: Onboarding, today?: Date): DeskCycle[] {
  const hash = JSON.stringify({
    frequency: cal.frequency,
    periodEndDay: cal.periodEndDay,
    payDay: cal.payDay,
    payDatesOfMonth: cal.payDatesOfMonth,
    cutoffDays: cal.cutoffDays,
    deadlineDays: cal.deadlineDays,
    approvedCycles: cal.approvedCycles,
    customRules: cal.customRules,
  })
  const periods = recentCycles(cal, 26, today)
  // Reuse runs across unrelated store updates, but expire them when the open period changes.
  const currentId = periods[0].id
  if (cached?.hash === hash && cached.currentId === currentId) return cached.cycles

  const cycles = periods.map((c): DeskCycle => {
    const blocks = cycleWeeks(c)
    // The week waiting on review is the setup sample's week, so setup and Payroll tell one story.
    const sampled = c.status === 'needs-review' ? sampleCycle(`S${c.id.replace(/-/g, '')}-`) : null
    const daysInPeriod = (Date.UTC(c.end.getFullYear(), c.end.getMonth(), c.end.getDate())
      - Date.UTC(c.start.getFullYear(), c.start.getMonth(), c.start.getDate())) / 86_400_000 + 1
    const scripted = c.status === 'in-progress'
    const week = sampled?.week ?? blocks.flatMap((start, block) => makeWeek({
      seed: Number(start.replace(/-/g, '')),
      start,
      scripted: scripted && start === blocks[0],
    })
      .filter((shift) => block * 7 + shift.day < daysInPeriod)
      // Use period-relative days so later blocks do not overlap the first block.
      .map((shift) => ({ ...shift, day: block * 7 + shift.day })))

    return {
      ...c,
      week,
      run: sampled?.run ?? runEngine(week),
      days: blocks.flatMap(dayLabels).slice(0, daysInPeriod),
      scripted,
      label: cycleLabel(c),
      statusTag: cal.approvedCycles.includes(c.id) ? 'Approved' : c.status === 'in-progress' ? 'In Progress' : c.status === 'needs-review' ? 'Pending' : 'Paid',
      // Keep accepted behavior when a cycle is approved or rolls into history; only
      // periods before the remembered decision are protected from retroactive changes.
      rememberedRuleIds: cal.customRules.filter((rule) => rule.autoApply && !rule.draft && rule.sourceRuleId
        && (rule.effectiveCycleStart ? c.start >= new Date(`${rule.effectiveCycleStart}T00:00:00`) : scripted))
        .map((rule) => rule.sourceRuleId!),
    }
  })
  cached = { hash, currentId, cycles }
  return cycles
}

/** Holds stay pending; otherwise explicit decisions win over remembered rules. */
export function rowResolution(c: DeskCycle, shiftId: string, ruleId: string, res: Onboarding['resolutions']) {
  if (c.server) {
    if (c.run.shifts.find(item => item.shift.id === shiftId)?.held) return undefined
    const group = [...(c.groups ?? []), ...(c.extraGroups ?? [])].find(item => item.ruleId === ruleId)
    const decision = c.decisions?.filter(item => item.cycleId === c.id && (item.groupId === ruleId || item.groupId === String(group?.id ?? ruleId)))
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))[0]
    return decision?.decision === 'approved' ? 'applied' as const : decision?.decision
  }
  return res[c.id]?.[shiftId] ?? (c.rememberedRuleIds?.includes(ruleId) ? 'applied' as const : undefined)
}

/** Whole-shift status for existing ledger/modal consumers, without clearing unrelated flags. */
export function effectiveResolutions(c: DeskCycle, res: Onboarding['resolutions']): Onboarding['resolutions'] {
  const decisions = c.server ? {} as Record<string, 'applied' | 'dismissed'> : { ...res[c.id] }
  for (const shift of c.run.shifts) {
    const pending = shift.rows.filter((row) => row.status === 'flag' || row.status === 'held')
    if (!(c.server && shift.held) && !decisions[shift.shift.id] && pending.length
      && pending.every((row) => ['applied', 'dismissed'].includes(rowResolution(c, shift.shift.id, row.ruleId, res) ?? ''))) {
      decisions[shift.shift.id] = pending.some(row => rowResolution(c, shift.shift.id, row.ruleId, res) === 'applied') ? 'applied' : 'dismissed'
    }
  }
  return { ...res, [c.id]: decisions }
}

/** Cross-source corrections can move an entry without emitting an engine pay effect. */
export function appliedCorrection(c: DeskCycle, row: Row): boolean {
  return row.status === 'applied' && (!!row.effect || !!(c.server
    && (c.groups?.some(group => group.ruleId === row.ruleId) || c.extraGroups?.some(group => group.ruleId === row.ruleId))))
}

/** `undone`: rules whose automatic fixes a person took back; those fixes wait for approval again. */
export function cycleStats(c: DeskCycle, res: Onboarding['resolutions'] = {}, undone: readonly string[] = []) {
  // Counted per shift, like his "payments": a shift with any undecided flag or hold needs
  // review; otherwise a shift carrying a real correction (applied with an effect, or a flag a
  // person has since decided) is resolved. Clean shifts count in neither, so total <= payments.
  let agentResolved = 0
  let needsReview = 0
  for (const shift of c.run.shifts) {
    let open = !!(c.server && shift.held)
    let corrected = false
    for (const row of shift.rows) {
      if (row.status === 'applied') {
        if (!appliedCorrection(c, row)) continue
        const decision = rowResolution(c, shift.shift.id, row.ruleId, res)
        if (decision === 'escalated') open = true
        else if (decision === 'dismissed') continue
        else if (!c.server && undone.includes(row.ruleId) && !res[c.id]?.[shift.shift.id]) open = true
        else corrected = true
      }
      else if (row.status === 'flag' || row.status === 'held') {
        const decision = rowResolution(c, shift.shift.id, row.ruleId, res)
        // "Not an issue" leaves the shift as it was: nothing corrected, nothing open.
        if (decision === 'applied') corrected = true
        else if (!decision || decision === 'escalated') open = true
      }
    }
    if (open) needsReview++
    else if (corrected) agentResolved++
  }
  const payout = payTotals(c)
  return {
    // A payment is one worker's paycheck for the cycle, however many time entries it covers.
    payments: payout.workerCount,
    gross: payout.gross,
    total: agentResolved + needsReview,
    agentResolved,
    needsReview,
  }
}

export function discrepancies(c: DeskCycle, res: Onboarding['resolutions']): Discrepancy[] {
  return c.run.shifts.flatMap((r) => r.rows.flatMap((row): Discrepancy[] => {
    if (row.status !== 'flag' && row.status !== 'held' && !(row.status === 'applied' && appliedCorrection(c, row))) return []
    return [{
      cycleId: c.id,
      shiftId: r.shift.id,
      worker: r.shift.worker,
      ruleId: row.ruleId,
      status: row.status,
      note: row.note,
      // The bench displays the shift's delta for each fired row, not the structured rule effect.
      effect: r.pay - r.naive,
      decided: rowResolution(c, r.shift.id, row.ruleId, res),
    }]
  })).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect) || a.shiftId.localeCompare(b.shiftId))
}

/** A rule's one classification: its bucket. Rules the user writes or uploads are "custom". */
export const kindLabel = (ruleId: string): string => kindNames[ruleId] ?? 'Custom'

/** One muted hue per bucket, stepped by the golden angle so buckets never share a colour, and the same on every page. */
export function bucketHue(ruleId: string): number {
  const labels = [...new Set(Object.values(kindNames)), 'Custom']
  return Math.round((25 + labels.indexOf(kindLabel(ruleId)) * 137.508) % 360)
}

const kindNames: Record<string, string> = {
  'CS-01': 'Duplicate',
  'TS-COMPLETE': 'Missing clock-out',
  'CS-16H': 'Over-length day',
  'CS-OVLP': 'Overlap',
  'CS-SPEED': 'Travel time',
  'CS-EXACT': 'Identical duration',
  'CS-EDIT': 'Post-approval edit',
  'SRC-VMS-01': 'Unsupported hours',
  'SRC-MISS-01': 'Missing time entry',
  'SRC-WEEK-01': 'Wrong week',
  'CON-MARGIN-01': 'Negative margin',
  'FAC-GEO-01': 'Location',
  'FAC-BADGE-01': 'Badge clock-out',
  'FAC-AUTODED-01': 'Automatic break deduction',
  'CA-MB-01': 'Meal break',
  'CA-SS-01': 'Split day',
  'CA-RT-01': 'Reporting-time pay',
  'NY-SOH-01': 'Spread of hours',
  'REST-GAP-01': 'Rest gap',
  'CHI-FWW-01': 'Schedule change',
  'CON-MIN-4H': 'Minimum pay',
  'CON-SUTTER-01': 'Training rate',
  'TW-1187': 'Weekly hours cap',
  'CA-ROUND-0': 'Rounding',
  'TB-ROUND-7': 'Rounding',
  'CA-OT-8': 'Daily overtime',
  'FED-OT-40': 'Weekly overtime',
  'FED-RR-01': 'Overtime rate',
  'VER-HC-01': 'Handoff overlap',
  'VER-EV-02': 'Event exit time',
}

/** Recommendations use only this rule's effects/evidence, never a neighboring OT row. */
function recommendationFor(ruleId: string, rows: Row[]): string {
  const effects = rows.flatMap((row) => row.effect ? [row.effect] : [])
  // Cross-source findings say what to fix in the source, whatever correction they carry.
  const reconciled: Record<string, string> = {
    'SRC-VMS-01': 'Correct the hours to the client’s clock and note it on the invoice',
    'SRC-MISS-01': 'Add the missing time entry before Payroll processing',
    'SRC-WEEK-01': 'Move the time entry into the week it started',
    'CON-MARGIN-01': 'Fix the bill rate on the order',
  }
  if (reconciled[ruleId]) return reconciled[ruleId]
  if (effects.some((effect) => effect.holdAll)) return 'Hold the affected payments for review'
  if (effects.some((effect) => effect.holdMin)) return 'Hold the hours above the rule’s cap for review'
  if (effects.some((effect) => effect.extendToMin != null)) return 'Pay through the confirmed badge-out time'
  if (effects.some((effect) => effect.rateOverride != null)) {
    const rates = [...new Set(effects.flatMap((effect) => effect.rateOverride == null ? [] : [effect.rateOverride]))]
    return rates.length === 1 ? `Apply the rule’s ${money(rates[0])}/h rate` : 'Apply the rates calculated by this rule'
  }
  if (effects.some((effect) => effect.topUpMin)) return 'Top up pay by the shortfall calculated for each day'
  if (effects.some((effect) => effect.premiumMin)) return 'Restore the deducted minutes calculated by this rule'
  if (effects.some((effect) => effect.premiumHours || effect.premiumAmt || effect.otPremiumMin)) {
    return ruleId === 'REST-GAP-01' && rows.some((row) => row.note.includes('no written consent'))
      ? 'Add the calculated rest-gap premium and request the missing consent'
      : 'Add the premium calculated by this rule'
  }
  if (ruleId === 'TS-COMPLETE' && rows.some((row) => row.status === 'applied')) return 'Use the clock-out confirmed in the recorded evidence'
  // These rules intentionally ask for verification and produce no monetary correction.
  const checks: Record<string, string> = {
    'CS-01': 'Merge the duplicate clock-ins into one entry',
    'TS-COMPLETE': 'Resolve the missing clock-out from location evidence and human confirmation',
    'CS-SPEED': 'Verify the conflicting punches across sites',
    'CS-EXACT': 'Verify the source of the identical recorded durations',
    'CS-EDIT': 'Re-review the edits made after supervisor approval',
    'FAC-GEO-01': 'Verify presence against the site’s location evidence',
    'FAC-BADGE-01': 'Request confirmation of the badge and clock-out mismatch',
  }
  return checks[ruleId] ?? 'Request review of the evidence flagged by this rule'
}

function insightFor(c: DeskCycle, ruleId: string, shifts: RunShift[], cycles: DeskCycle[]): string | undefined {
  if (ruleId === 'CS-01' && shifts.length && shifts.every(({ shift }) => c.run.ctx.dupGap(shift) != null)) {
    const sources = new Set(shifts.map(({ shift }, index) => provenance(c, shift, index).file))
    if (sources.size === 1) return 'The duplicate clock-ins are recorded in the same source export'
  }
  if (ruleId === 'FAC-AUTODED-01' && shifts.every(({ shift }) => shift.fac.autoDeduct && !shift.meal && shift.mealEvidence === false)) {
    return 'Every affected payment has an automatic deduction, no meal punch and evidence that no break occurred'
  }
  if (ruleId === 'FAC-BADGE-01' && shifts.every(({ shift }) => shift.badgeOut != null && shift.resolution)) {
    return 'Every affected payment has a badge-out record and a recorded human confirmation'
  }
  if (ruleId === 'TS-COMPLETE' && shifts.every(({ shift }) => shift.geo && shift.resolution)) {
    return 'Every missing clock-out has location evidence and a recorded human confirmation'
  }
  if (ruleId === 'CON-SUTTER-01' && shifts.every(({ shift }) => shift.orientation)) {
    const rates = [...new Set(shifts.flatMap(({ rows }) => rows.flatMap((row) => row.ruleId === ruleId && row.effect?.rateOverride != null ? [row.effect.rateOverride] : [])))]
    if (rates.length === 1) return `Every affected payment is marked as orientation; the rule specifies ${money(rates[0])}/h`
  }
  if (ruleId === 'REST-GAP-01' && shifts.every(({ shift }) => !shift.consentClopen)) {
    return 'None of the affected payments has written clopening consent on file'
  }
  const sites = [...new Set(shifts.map(({ shift }) => shift.fac.name))]
  const prior = cycles.filter((cycle) => cycle.end < c.start)
  if (sites.length === 1 && prior.length && !prior.some((cycle) => cycle.run.shifts.some((shift) =>
    shift.shift.fac.name === sites[0] && shift.rows.some((row) => row.ruleId === ruleId && (row.status === 'flag' || row.status === 'held'))))) {
    return `No matching flags at ${sites[0]} in the previous ${prior.length} available cycles`
  }
  return undefined
}

export function kinds(c: DeskCycle, res: Onboarding['resolutions'], cycles: DeskCycle[] = []): Kind[] {
  const groups = new Map<string, Discrepancy[]>()
  for (const item of discrepancies(c, res)) {
    if (item.decided && item.decided !== 'escalated' || (item.status !== 'flag' && item.status !== 'held')) continue
    const cases = groups.get(item.ruleId) ?? []
    // A flag and its proposed correction are one case, with the flag explaining the stop.
    if (!cases.some((existing) => existing.shiftId === item.shiftId)) cases.push(item)
    groups.set(item.ruleId, cases)
  }
  return [...groups].map(([ruleId, cases]): Kind => {
    const rule = RULES.find((r) => r.id === ruleId)
    const shifts = c.run.shifts.filter((rs) => cases.some((item) => item.shiftId === rs.shift.id))
    const proposal = shifts.flatMap((rs) => rs.rows).find((row) => row.ruleId === ruleId && appliedCorrection(c, row))
      ?? shifts.flatMap((rs) => rs.rows).find((row) => appliedCorrection(c, row))
    const stops = cases.filter((item) => item.status === 'flag' || item.status === 'held').map((item) => item.note)
    // Automatic corrections can share a held shift. Explain its actual stop as evidence.
    const relatedStops = shifts.flatMap((rs) => rs.rows.filter((row) => row.status === 'flag' || row.status === 'held').map((row) => row.note))
    const stopNotes = [...new Set(stops.length ? stops : relatedStops.length ? relatedStops : [cases[0].note])]
    // A rule can emit both flag and applied rows for one shift; count its exposure once.
    const effects = [...new Map(cases.map((item) => [item.shiftId, item.effect])).values()]
    const ruleRows = shifts.flatMap((shift) => shift.rows.filter((row) => row.ruleId === ruleId))
    const insight = insightFor(c, ruleId, shifts, cycles)
    return {
      ruleId,
      label: kindNames[ruleId] ?? rule?.bucket ?? 'Review',
      recommendation: recommendationFor(ruleId, ruleRows),
      ...(insight ? { insight } : {}),
      // Matches the ledger: each affected shift's net delta appears once per bucket.
      // Buckets can overlap, so their impacts are not additive across the whole cycle.
      impact: effects.reduce((total, effect) => total + effect, 0),
      agentResolved: c.run.shifts.reduce((total, shift) => total + shift.rows.filter((row) => row.ruleId === ruleId
        && (row.status === 'applied' || ((row.status === 'flag' || row.status === 'held')
          && rowResolution(c, shift.shift.id, ruleId, res) === 'applied'))).length, 0),
      // KPI fields count trace rows; cases stays deduplicated for payment actions.
      needsReview: ruleRows.filter((row) => row.status === 'flag' || row.status === 'held').length,
      sentence: rule?.sentence ?? cases[0].note,
      bucket: rule?.bucket ?? '',
      cases,
      over: effects.reduce((total, effect) => total + Math.max(0, -effect), 0),
      under: effects.reduce((total, effect) => total + Math.max(0, effect), 0),
      wouldDo: proposal?.note.replace(/^Worked past [^:]+:\s*/, 'Pay ').replace(/\.$/, '') ?? rule?.sentence ?? cases[0].note,
      whyStopped: stopNotes.length > 1 ? stopNotes.map((note) => /[.!?…]$/.test(note) ? note : `${note}.`).join(' ') : stopNotes[0],
    }
  }).sort((a, b) => (b.over + b.under) - (a.over + a.under) || a.ruleId.localeCompare(b.ruleId))
}

/** Accept every case in one bucket with a single persisted store update. */
export function applyKind(cycleId: string, ruleId: string): number {
  const state = getOnboarding()
  const cycle = activeCycles(state).find((item) => item.id === cycleId)
  const kind = cycle && kinds(cycle, state.resolutions).find((item) => item.ruleId === ruleId)
  if (!kind) return 0
  const decisions = { ...state.resolutions[cycleId] }
  const decisionTimes = { ...state.decisionTimes }
  const at = new Date().toISOString()
  for (const item of kind.cases) {
    decisions[item.shiftId] = 'applied'
    decisionTimes[`${cycleId}:${item.shiftId}`] = at
  }
  updateOnboarding({ resolutions: { ...state.resolutions, [cycleId]: decisions }, decisionTimes })
  return kind.cases.length
}

/** Remember the accepted source rule from the present cycle forward, including later approval. */
export function rememberKind(ruleId: string): void {
  const rule = RULES.find((item) => item.id === ruleId)
  if (!rule) return
  const state = getOnboarding()
  if (state.customRules.some((item) => item.sourceRuleId === ruleId && item.autoApply && !item.draft)) return
  const current = activeCycles(state)[0]
  const effectiveCycleStart = `${current.start.getFullYear()}-${String(current.start.getMonth() + 1).padStart(2, '0')}-${String(current.start.getDate()).padStart(2, '0')}`
  updateOnboarding({ customRules: [...state.customRules, {
    id: `remember-${ruleId}-${Date.now()}`,
    bucket: 'Custom',
    kind: rule.kind,
    sentence: rule.sentence,
    source: { doc: `Remembered decision · ${ruleId}` },
    draft: false,
    at: Date.now(),
    sourceRuleId: ruleId,
    autoApply: true,
    effectiveCycleStart,
  }] })
}

/** Compact display only; selections, links and provenance keep the full shift id. */
export function shortShiftId(id: string): string {
  return id.replace(/^W\d+-/, '')
}

export function provenance(c: DeskCycle, s: Shift, index: number): Provenance {
  const prov = (s as DeskShift).prov
  if (prov) {
    const sourceId = c.intake?.expected.find(entry => entry.worker === s.worker && entry.client === s.fac.name && entry.day === s.day)?.source
    const source = c.intake?.sources.find(item => item.id === sourceId)
    return { ...prov, system: prov.system ?? source?.short ?? 'Time export', sample: (s as DeskShift).sample ?? prov.sample ?? c.sample }
  }
  const facilityKey = Object.keys(FACILITIES).find((key) => FACILITIES[key].name === s.fac.name)
    ?? s.fac.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const source = sourceFor(facilityKey)
  const sourceIndex = c.week.filter((shift) => shift.fac.name === s.fac.name).findIndex((shift) => shift.id === s.id)
  return {
    system: source?.short ?? 'Time export',
    file: `${(source?.id ?? 'timesheet').replace(/-/g, '_')}_${facilityKey}_${cycleWeeks(c)[0]}.csv`,
    // Row 1 is the export header; use source order, independent of table sorting/filtering.
    row: (sourceIndex >= 0 ? sourceIndex : index) + 2,
  }
}

export function topstats(c: DeskCycle, res: Onboarding['resolutions'] = {}): string {
  const { under, over } = c.run.totals
  let flags = 0
  let held = 0
  for (const shift of c.run.shifts) {
    for (const row of shift.rows) {
      if (rowResolution(c, shift.shift.id, row.ruleId, res)) continue
      if (row.status === 'flag') flags++
      if (row.status === 'held') held++
    }
  }
  return `${c.label} · ${flags} flagged · ${held} held · +${money(under)} / −${money(over)}`
}

/** The synthetic generator is an explicit, signed-out demo mode; an account with a session or data always reads the server. */
export function activeCycles(cal: Onboarding): DeskCycle[] {
  return synthetic(cal) ? buildCycles(cal) : serverCycles(cal)
}
function synthetic(cal: Onboarding): boolean {
  const data = getDataSnapshot()
  const account = viewerSession()?.email ?? 'development'
  return cal.dataSource === 'synthetic' && !viewerSession() && !(data.owner === account && (data.payloads.length > 0 || data.sources.length > 0 || data.files.length > 0))
}

export function useDesk(): { cycles: DeskCycle[]; current: DeskCycle; loaded?: boolean; loading?: boolean; error?: string | null; cycleErrors?: Record<string, string>; byId(id: string): DeskCycle | undefined } {
  const [cal] = useOnboarding()
  const data = useData(cal.dataSource !== 'synthetic' || !!viewerSession())
  const cycles = activeCycles(cal)
  const loaded = synthetic(cal) || data.loaded
  return useMemo(() => ({ cycles, current: cycles[0], loaded, loading: !loaded || data.loading, error: data.error, cycleErrors: data.cycleErrors, byId: (id: string) => cycles.find((c) => c.id === id) }), [cycles, loaded, data.loading, data.error, data.cycleErrors])
}
