/** Run manually against p5-session-b-server.mjs; uses the real local agent, outside CI. */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const base = process.env.P5_EVAL_URL ?? 'http://127.0.0.1:8787'
const folder = new URL('../.data/p5-session-b/', import.meta.url)
await mkdir(folder, { recursive: true })
const transcript = []
const save = () => writeFile(new URL('transcript.json', folder), JSON.stringify(transcript, null, 2))
async function json(path, options) {
  const response = await fetch(`${base}${path}`, options)
  const body = await response.json()
  assert.ok(response.ok, `${path}: HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}
async function chat(message, mode, context) {
  console.log(`USER (${mode}): ${message}`)
  const response = await fetch(`${base}/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, mode, context }), signal: AbortSignal.timeout(330000),
  })
  const raw = await response.text()
  const events = raw.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5)))
  const done = events.findLast(event => event.done)
  const agent = done?.final ?? events.map(event => event.text ?? '').join('')
  transcript.push({ user: message, mode, context, status: response.status, agent, events: events.filter(event => !('text' in event)) })
  await save()
  console.log(`AGENT: ${agent}`)
  console.log(JSON.stringify(events.filter(event => event.ingest || event.facts)))
  assert.equal(response.status, 200)
  assert.ok(done && !done.error, done?.error ?? 'Missing done event')
  return events
}

const bytes = await readFile(new URL('p5-unfamiliar-09-20-2026.csv', import.meta.url))
const upload = await json('/files', { method: 'POST', headers: {
  'Content-Type': 'text/csv', 'X-File-Name': 'p5-unfamiliar-09-20-2026.csv', 'X-Set': '1',
  'X-System': 'Spreadsheet', 'X-Site': encodeURIComponent('Pacific Cold Storage'),
}, body: bytes })
transcript.push({ upload }); await save()
assert.equal(upload.file.status, 'needs_mapping')
const events = await chat('Uploaded p5-unfamiliar-09-20-2026.csv for Pacific Cold Storage. These are our worker-reported time entries.', 'ingest', { fileIds: [upload.file.id] })
const normalized = events.find(event => event.ingest?.status === 'normalized')?.ingest
assert.ok(normalized, 'The real agent must produce an accepted mapping')
assert.equal(normalized.entries, 3)
assert.ok(events.findIndex(event => event.ingest) < events.findIndex(event => event.done), 'Ingest precedes done')
const cycleId = normalized.cycles.find(id => id === '2026-09-20') ?? normalized.cycles[0]
assert.ok(cycleId, 'Normalization must recompute a cycle')
const payload = await json(`/data/cycles/${cycleId}`)
const evidence = await json(`/data/entries?cycle=${cycleId}`)
assert.equal(evidence.entries.length, 3)
assert.equal(payload.week.length, 3)
transcript.push({ verification: { cycleId, runId: payload.runId, entries: evidence.entries.length, timeEntries: payload.week.length, totals: payload.totals, gaps: payload.gaps } }); await save()
await chat("Which files do I have and what's missing?", 'chat', { page: '/payroll', cycleId })
const factEvents = await chat('Pacific Cold Storage is in Fresno, California.', 'chat', { page: '/payroll', cycleId })
assert.ok(factEvents.some(event => event.facts?.applied > 0), 'The answer must be persisted with set_fact')
const updated = await json(`/data/cycles/${cycleId}`)
assert.ok(!updated.gaps.some(gap => gap.kind === 'site'), 'The answered site gap must close')
assert.notEqual(updated.runId, payload.runId, 'The fact must change the cycle run')
transcript.push({ factVerification: { runId: updated.runId, gaps: updated.gaps } }); await save()
console.log(`PASS: mapping accepted, 3 entries, cycle ${cycleId} re-run; workspace answer captured.`)
