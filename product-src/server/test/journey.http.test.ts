import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createServer } from '../src/index.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import { signSession } from '../src/auth.ts'
import { workspacePath } from '../src/workspace.ts'
import type { StateStore } from '../src/state.ts'

const env = { NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: 'dev@hypertrack.io', ALLOWED_DOMAINS: 'hypertrack.io', SESSION_SECRET: 'p7-test-secret-that-is-at-least-32-bytes' }
const post = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const us = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`
/** Worker-reported time with no client-approved match: each row becomes an intake gap. */
const bullhorn = (rows: [string, string][]) => ({ method: 'POST', headers: { 'Content-Type': 'text/csv', 'X-File-Name': 'bullhorn_extra.csv', 'X-Set': '1' }, body: [
  'Candidate,Placement ID,Client,Job Title,Date,Start,End,Break (min),Hours,Pay Rate,Bill Rate,Entered Via,Status,Approved By,Comment',
  ...rows.map(([name, date], i) => `${name},9${i},Pacific Cold Storage,Warehouse,${us(date)},8:00 AM,4:30 PM,30,8,20,30,Web time entry,Approved,Supervisor,`),
].join('\r\n') })

test('closeout journey: next step, decisions, asks, send once, dispute adjustment on the next cycle, workspace', async t => {
  const root = await mkdtemp(join(tmpdir(), 'closeout-journey-http-'))
  const doc = { neverContact: ['Blocked Worker'], profile: { payrollRunBy: 'I run it in ADP' } }
  const stateStore: StateStore = { get: async () => ({ doc, updated_at: '2026-09-25T00:00:00.000Z' }), put: async () => ({ status: 409, row: null }) }
  const server = createServer({ dataStore: createMemoryDataStore(), stateStore, env: { ...env, CLOSEOUT_DATA_DIR: root }, claudeVersion: async () => 'test' })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }) })
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const call = async (path: string, init?: RequestInit) => { const response = await fetch(url + path, init); return { status: response.status, body: await response.json() } }

  const { body: seeded } = await call('/data/sample', post({}))
  const id = seeded.cycleId as string, next = addDays(id, 7)

  await t.test('GET /data/cycles/:id keeps the payload and adds decisions, batch and nextStep', async () => {
    const { status, body } = await call(`/data/cycles/${id}`)
    assert.equal(status, 200)
    assert.equal(body.groups.length, 7)
    assert.equal(body.week.length, 6283)
    assert.deepEqual([body.decisions, body.batch, body.adjustments], [[], null, []])
    assert.deepEqual(body.nextStep, { kind: 'review', label: 'Review 5 issues', detail: 'Approve, dismiss or escalate each group before Payroll', counts: { missingSets: 0, gaps: 0, openGroups: 5 } })
  })

  await t.test('intake gaps lead to chase missing; asks skip the never-contact list and leave gaps open', async () => {
    assert.equal((await fetch(url + '/files', bullhorn([['Test Worker', addDays(id, -4)], ['Blocked Worker', addDays(id, -3)]]))).status, 201)
    const { body } = await call(`/data/cycles/${id}`)
    assert.deepEqual([body.nextStep.kind, body.nextStep.counts.gaps], ['chase_missing', 2])
    const gapIds = [`Pacific Cold Storage|Test Worker|2`, `Pacific Cold Storage|Blocked Worker|3`]
    assert.equal((await call(`/data/cycles/${id}/asks`, post({ gapIds: ['nope|x|1'] }))).status, 400)
    const asks = await call(`/data/cycles/${id}/asks`, post({ gapIds }))
    assert.equal(asks.status, 200)
    assert.deepEqual(asks.body.skipped, ['Blocked Worker'])
    assert.equal(asks.body.threads.length, 1)
    const [thread] = asks.body.threads
    assert.deepEqual([thread.counterparty.kind, thread.counterparty.name, thread.status, thread.counterparty.gapIds], ['worker', 'Test Worker', 'waiting', [gapIds[0]]])
    assert.deepEqual(thread.messages.map((m: { dir: string; status: string }) => [m.dir, m.status]), [['out', 'not_sent_demo']])
    assert.match(thread.messages[0].text, /^Hi Test, the client-approved hours are missing/)
    // Both gaps stay open: an ask and an entered reply are not reconciled evidence.
    assert.deepEqual([(await call(`/data/cycles/${id}`)).body.nextStep.kind, (await call(`/data/cycles/${id}`)).body.nextStep.counts.gaps], ['chase_missing', 2])
    const reply = await call(`/data/threads/${thread.id}/messages`, post({ dir: 'in', text: 'Yes, 8 to 4:30 with a 30 minute lunch' }))
    assert.equal(reply.status, 201)
    assert.deepEqual([reply.body.message.status, reply.body.thread.status, reply.body.thread.messages.length], ['recorded', 'open', 2])
    assert.equal((await call(`/data/threads/${thread.id}/messages`, post({ dir: 'in', text: 'x', extra: 1 }))).status, 400)
    assert.equal((await call('/data/threads/t_0000000000000000/messages', post({ dir: 'in', text: 'x' }))).status, 404)
    const listed = await call(`/data/threads?cycleId=${id}`)
    assert.equal(listed.body.threads.length, 1)
  })

  await t.test('decisions are validated, idempotent and return the updated cycle', async () => {
    assert.equal((await call(`/data/cycles/${id}/decisions`, post({ groupId: 'CA-MB-01', decision: 'dismissed' }))).status, 400)
    const first = await call(`/data/cycles/${id}/decisions`, post({ groupId: 'CA-MB-01', decision: 'approved' }))
    assert.equal(first.status, 200)
    assert.equal(first.body.decision.shiftIds.length, 95)
    assert.equal(first.body.cycle.groups.length, 7, 'the full cycle payload comes back')
    assert.deepEqual(first.body.cycle.adjustments, [], 'decision responses carry the scoped adjustment snapshot')
    const again = await call(`/data/cycles/${id}/decisions`, post({ groupId: 'CA-MB-01', decision: 'dismissed', reason: 'Signed waivers on file' }))
    assert.equal(again.body.decision.id, first.body.decision.id)
    assert.deepEqual(again.body.cycle.decisions.map((d: { groupId: string; decision: string }) => [d.groupId, d.decision]), [['CA-MB-01', 'dismissed']])
    assert.equal((await call(`/data/cycles/2020-01-05/decisions`, post({ groupId: 'CA-MB-01', decision: 'approved' }))).status, 404)
  })

  await t.test('send is refused until review is done, then exports once; a re-send returns 409', async () => {
    const early = await call(`/data/cycles/${id}/send`, post({}))
    assert.equal(early.status, 422)
    // FAC-GEO-01: the two uploaded time entries have no location at a geofenced site.
    assert.deepEqual(early.body.open.groups.sort(), ['CON-MARGIN-01', 'CS-01', 'FAC-GEO-01', 'FED-RR-01', 'SRC-MISS-01'])
    await call(`/data/cycles/${id}/asks`, post({ gapIds: [`Pacific Cold Storage|Blocked Worker|3`] }))
    for (const groupId of ['CS-01', 'FAC-GEO-01', 'FED-RR-01', 'SRC-MISS-01']) await call(`/data/cycles/${id}/decisions`, post({ groupId, decision: 'approved' }))
    const { body: ready } = await call(`/data/cycles/${id}/decisions`, post({ groupId: 'CON-MARGIN-01', decision: 'escalated' }))
    assert.equal(ready.cycle.nextStep.kind, 'chase_missing', 'the never-contact gap still needs someone else')
    const sent = await call(`/data/cycles/${id}/send`, post({ force: true }))
    assert.equal(sent.status, 201)
    assert.deepEqual(sent.body.open.gaps.sort(), ['Pacific Cold Storage|Blocked Worker|3', 'Pacific Cold Storage|Test Worker|2'])
    const { batch, csvUrl } = sent.body
    assert.equal(batch.destination, 'ADP')
    const csv = await fetch(url + csvUrl)
    assert.match(csv.headers.get('content-disposition')!, new RegExp(`attachment; filename="payroll-${id}.csv"`))
    const rows = (await csv.text()).trim().split('\r\n')
    assert.equal(rows[0], 'worker,regular_hours,ot_hours,premium_hours,gross,held_entries')
    const cells = rows.slice(1).map(row => row.split(','))
    assert.equal(cells.length, batch.workers)
    assert.equal(Math.round(cells.reduce((n, c) => n + Number(c[4]), 0) * 100) / 100, batch.gross)
    assert.ok(cells.every(c => c[3] === '0.00'), 'dismissed meal premiums are not paid')
    assert.equal(batch.held, 0)
    const resend = await call(`/data/cycles/${id}/send`, post({}))
    assert.deepEqual([resend.status, resend.body.batch.id], [409, batch.id])
    assert.equal((await call(`/data/cycles/${id}`)).body.nextStep.kind, 'chase_missing')
    assert.equal((await call(`/data/cycles/${id}`)).body.batch.id, batch.id, 'paid status is independent of the unresolved next step')
    const { sessionToken } = await signSession({ sub: 'x', email: 'other@hypertrack.io', name: 'Other', picture: '' }, env.SESSION_SECRET)
    assert.equal((await fetch(url + csvUrl, { headers: { Authorization: `Bearer ${sessionToken}` } })).status, 404, 'another account cannot download it')
  })

  await t.test('a simulated dispute adjusts pay on the next cycle export', async () => {
    const simulated = await call('/data/disputes/simulate', post({ cycleId: id }))
    assert.equal(simulated.status, 201)
    const { dispute, thread } = simulated.body
    assert.deepEqual([dispute.source, dispute.status, thread.disputeId, thread.counterparty.kind], ['simulated', 'open', dispute.id, 'worker'])
    assert.deepEqual(thread.messages.map((m: { dir: string }) => m.dir), ['in', 'note'])
    assert.match(thread.messages[1].text, /location .*on site after clock-out/)
    const resolved = await call(`/data/disputes/${dispute.id}/resolve`, post({ decision: 'adjust', hours: 0.25, note: 'Location backs 13 minutes after clock-out' }))
    assert.equal(resolved.status, 200)
    assert.equal(resolved.body.dispute.adjustment.next_cycle_id, next)
    assert.ok(resolved.body.dispute.adjustment.amount > 0)
    assert.equal(resolved.body.thread.status, 'resolved')
    assert.equal((await call(`/data/disputes/${dispute.id}/resolve`, post({ decision: 'reject', note: 'Again' }))).status, 409)
    assert.equal((await fetch(url + '/files', { ...bullhorn([['Test Worker', addDays(id, 2)]]), headers: { 'Content-Type': 'text/csv', 'X-File-Name': 'bullhorn_next.csv', 'X-Set': '1' } })).status, 201)
    const nextCycle = await call(`/data/cycles/${next}`)
    assert.deepEqual(nextCycle.body.adjustments, [{ id: dispute.id, cycleId: id, worker: dispute.worker, hours: 0.25, amount: resolved.body.dispute.adjustment.amount }])
    assert.deepEqual((await call(`/data/cycles/${id}`)).body.adjustments, [], 'the original paid cycle does not include a future adjustment')
    const nextSend = await call(`/data/cycles/${next}/send`, post({ force: true }))
    assert.equal(nextSend.status, 201)
    const rows = (await (await fetch(url + nextSend.body.csvUrl)).text()).trim().split('\r\n')
    assert.ok(rows.includes(`${dispute.worker} · Adjustment for ${id},0.25,0.00,0.00,${resolved.body.dispute.adjustment.amount.toFixed(2)},0`), rows.join('\n'))
    assert.equal((await call('/data/disputes')).body.disputes.length, 1)
  })

  await t.test('materialize writes decisions, threads, disputes, batches and nextstep.md', async () => {
    const cwd = workspacePath('dev@hypertrack.io', { ...env, CLOSEOUT_DATA_DIR: root })
    const decisions = (await readFile(join(cwd, 'data/decisions.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    assert.deepEqual(decisions.map(d => d.groupId).sort(), ['CA-MB-01', 'CON-MARGIN-01', 'CS-01', 'FAC-GEO-01', 'FED-RR-01', 'SRC-MISS-01'])
    assert.ok(decisions.every(d => d.shiftIds.length <= 20))
    const threads = await readdir(join(cwd, 'data/threads'))
    assert.equal(threads.length, 2, 'one ask thread (the never-contact worker was skipped) and one dispute thread')
    assert.ok(threads.every(name => /^t_[0-9a-f]{16}\.md$/.test(name)))
    const disputes = await readdir(join(cwd, 'data/disputes'))
    assert.match(await readFile(join(cwd, 'data/disputes', disputes[0]), 'utf8'), new RegExp(`Adjustment: 0.25h, .* lands on the ${next} Payroll export`))
    assert.deepEqual((await readdir(join(cwd, 'data/batches'))).sort(), [`${id}.csv`, `${next}.csv`])
    const nextstep = await readFile(join(cwd, 'nextstep.md'), 'utf8')
    assert.match(nextstep, new RegExp(`${id}: chase_missing`))
    assert.match(nextstep, new RegExp(`${next}: get_timesheets`))
  })
})
