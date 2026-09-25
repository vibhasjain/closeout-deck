/** Manual local eval server: real Claude, isolated memory data/state, no production writes. */
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from '../src/index.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import { conditionalState } from '../src/state.ts'
import { signSession } from '../src/auth.ts'

const folder = new URL('../.data/p5-session-b/', import.meta.url)
await mkdir(folder, { recursive: true, mode: 0o700 })
const email = `p5-session-b-${Date.now()}@hypertrack.io`
const env = {
  ...process.env, NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: email,
  ALLOWED_DOMAINS: 'hypertrack.io', SESSION_SECRET: randomBytes(32).toString('hex'),
  CLOSEOUT_DATA_DIR: fileURLToPath(new URL('workspace/', folder)),
  CLOSEOUT_INGEST_TIMEOUT_MS: '300000',
}
const rows = new Map()
const stateStore = {
  async get(account) { return rows.get(account) ?? null },
  async put(account, doc, base) {
    const result = conditionalState(rows.get(account) ?? null, doc, base)
    if (result.kind === 'conflict') return { status: 409, row: result.row }
    rows.set(account, result.row)
    return { status: 200, row: result.row }
  },
}
await stateStore.put(email, {
  frequency: 'Weekly', periodEndDay: 'Sunday', payDay: 'Friday', payDatesOfMonth: [20, 5],
  cutoffDays: 1, deadlineDays: 2, timezone: 'America/New_York',
  setupStep: 'ready', forwarded: true,
  firm: { name: 'P5 local eval', summary: '', states: [], verticals: [], clientTypes: [], size: '', staffing: true },
}, null)
const session = await signSession({ sub: email, email, name: 'P5 local eval', picture: '' }, env.SESSION_SECRET)
await writeFile(new URL('browser-session.json', folder), JSON.stringify(session), { mode: 0o600 })
const server = createServer({ env, dataStore: createMemoryDataStore(), stateStore })
server.listen(Number(process.env.P5_EVAL_PORT ?? 8787), '127.0.0.1', () => {
  console.log(`P5 eval server listening at http://127.0.0.1:${server.address().port}; real Claude, isolated memory stores.`)
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
