import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DataService } from '../src/data.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import { disputeEvidence, draftAsk, nextStep, simulatedDispute, summarize, type JourneyCycle } from '../src/journey.ts'

/** H1/H2: the owner's words "Timesheets" and "Get timesheets" stay; nothing else says timesheets, and nothing says shifts. */
function copyViolations(text: string): string[] {
  const allowed = text.replace(/\bGet timesheets\b/g, '')
  return [...allowed.matchAll(/\b(?:shifts?|timesheets?)\b/gi)].map(match => allowed.slice(Math.max(0, match.index - 40), match.index + 40))
}

test('H1/H2: server-drafted copy (finding groups, notes, gaps, next steps, asks, disputes) never says shifts or timesheets', async () => {
  const store = createMemoryDataStore(), service = new DataService(store), email = 'copy@example.com', now = new Date('2026-09-25T12:00:00Z')
  const seeded = await service.seed(email, {}, now)
  const payload = (await store.getRunPayload(email, seeded.cycleId))!
  const summary = summarize(payload)
  const strings: string[] = []
  for (const group of [...payload.groups, ...payload.extraGroups]) strings.push(group.tag, group.title, group.summary, group.why, group.action, group.draft ?? '', group.hoursLabel, group.amountLabel)
  for (const result of payload.results) for (const row of result.rows) strings.push(row.note)
  strings.push(...payload.gaps.map(gap => gap.ask))
  const cycle = (patch: Partial<JourneyCycle>): JourneyCycle => ({ id: payload.cycle.id, counts: { set1: 1, set2: 1, set3: 1 }, gaps: [], groups: [], ...patch })
  for (const state of [cycle({ counts: { set1: 0, set2: 0, set3: 0 } }), cycle({ gaps: ['a|b|0', 'a|c|1'] }), cycle({ groups: [{ id: 'CA-MB-01', num: 4, state: 'proposed', shiftIds: [] }] }), cycle({})]) {
    const step = nextStep(state, [], null)
    strings.push(step.label, step.detail)
  }
  const gaps = [{ id: 'Lonestar Packaging|Ana Reid|0', worker: 'Ana Reid', client: 'Lonestar Packaging', day: 0 }, { id: 'Lonestar Packaging|Ana Reid|2', worker: 'Ana Reid', client: 'Lonestar Packaging', day: 2, onSite: 480 }]
  strings.push(draftAsk({ kind: 'worker', name: 'Ana Reid' }, gaps, summary, '2026-09-30'), draftAsk({ kind: 'worker', name: 'Ana Reid' }, gaps.slice(0, 1), summary, '2026-09-30'))
  strings.push(draftAsk({ kind: 'site', name: 'Dana Ruiz' }, gaps, summary, '2026-09-30'))
  const dispute = simulatedDispute(payload)
  if (dispute) strings.push(dispute.description, disputeEvidence(payload, dispute.worker).text)
  assert.ok(strings.filter(Boolean).length > 50, 'the sample covers the templates')
  assert.equal(copyViolations('Did you work those shifts? Timesheet cutoff. Get timesheets').length, 2, 'the check itself catches both words')
  assert.deepEqual(strings.flatMap(copyViolations), [])
  // The step label keeps the owner's words.
  assert.equal(nextStep(cycle({ counts: { set1: 0, set2: 0, set3: 0 } }), [], null).label, 'Get timesheets')
})
