import assert from 'node:assert/strict'
import test from 'node:test'
import { knownFirmClients, validFirmName } from '../src/firmName.ts'
import { SAMPLE_FIRM } from '../src/firm.ts'
import { runDataTurn, type DataEvent } from '../src/agentTurn.ts'
import { DataService } from '../src/data.ts'
import { createMemoryDataStore } from '../src/datastore.ts'

test('the agency name is never a joined list of known clients, but agency punctuation is valid', () => {
  const clients = knownFirmClients(SAMPLE_FIRM)
  assert.equal(SAMPLE_FIRM.name, 'Summit Staffing')
  assert.deepEqual(clients, ['Pacific Cold Storage', 'Lonestar Packaging', 'Pacific Cold Storage', 'Lonestar Packaging'])
  for (const separator of [' / ', ' & ', ', ', ' and ']) assert.equal(validFirmName(`Pacific Cold Storage${separator}Lonestar Packaging`, clients), false)
  for (const name of ['Summit Staffing', 'Smith & Jones Staffing', 'Anderson and Sons Staffing', 'Staffing Partners, Inc.']) assert.equal(validFirmName(name, clients), true)
  for (const name of ['', ' ', 1, null, 'a'.repeat(201)]) assert.equal(validFirmName(name, clients), false)
})

test('the server strips invalid set_firm names before the final event while preserving valid fields and actions', async () => {
  const store = createMemoryDataStore(), email = 'firm-name@test.example'
  await store.upsertFact(email, { kind: 'site', key: 'north warehouse', value: { state: 'MA' }, source: 'user', sample: false, updatedAt: new Date().toISOString() })
  await store.upsertSource(email, { id: 'source-test', set: 2, site: 'West Factory', system: 'Client portal', method: 'simulated', sample: false, createdAt: new Date().toISOString(), lastReceivedAt: null })
  for (const name of ['North Warehouse / West Factory', 'North Warehouse & West Factory', 'North Warehouse, West Factory', 'North Warehouse and West Factory']) {
    const events: DataEvent[] = []
    const action = '```action\n' + JSON.stringify({ type: 'set_firm', patch: { name, states: ['MA'] } }) + '\n```'
    await runDataTurn({ options: { cwd: '/tmp', prompt: '', message: '', env: {} },
      runAgent: async options => { options.onEvent({ text: action }); options.onEvent({ done: true, sessionId: 'test' }) },
      service: new DataService(store), email, doc: { firm: { name: 'Agency Staffing', domain: 'agency.example' } }, sync: async () => {}, emit: event => events.push(event) })
    assert.deepEqual(events.at(-1), { done: true, sessionId: 'test', final: '```action\n{"type":"set_firm","patch":{"states":["MA"]}}\n```' })
  }
})

test('a name-only invalid patch is removed even when the agent streams without a final string', async () => {
  const events: DataEvent[] = [], reply = '```action\n{"type":"set_firm","patch":{"name":"Pacific Cold Storage / Lonestar Packaging"}}\n```'
  await runDataTurn({ options: { cwd: '/tmp', prompt: '', message: '', env: {} },
    runAgent: async options => { options.onEvent({ text: reply }); options.onEvent({ done: true, sessionId: 'test' }) },
    service: new DataService(createMemoryDataStore()), email: 'sample@test.example', doc: { firm: SAMPLE_FIRM }, sync: async () => {}, emit: event => events.push(event) })
  assert.deepEqual(events.at(-1), { done: true, sessionId: 'test', final: '' })
})
