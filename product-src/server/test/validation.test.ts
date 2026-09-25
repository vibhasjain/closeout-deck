import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_CONTEXT_CHARS, MAX_DOC_BYTES, MODES, chatMessage, validateChatBody, validateChatHistory, validateStateBody, ValidationError } from '../src/validation.ts'

test('chat validation accepts each known mode and keeps message and context intact', () => {
  for (const mode of MODES) {
    const body = { mode, message: ' Hi ', context: { page: '/payroll', count: 3, ...(mode === 'ingest' ? { fileIds: ['f_abcdefghijkl'] } : {}) } }
    assert.deepEqual(validateChatBody(body), body)
  }
})

test('chat validation rejects unknown modes, blank messages and non-object context', () => {
  const valid = { mode: 'chat', message: 'Hi', context: {} }
  for (const body of [null, [], {}, { ...valid, mode: 'other' }, { ...valid, message: '' },
    { ...valid, message: '  \n' }, { ...valid, message: 3 }, { ...valid, context: [] },
    { ...valid, context: null }, { ...valid, context: 'bad' }, { ...valid, context: new Date() },
    { ...valid, context: { invalid: undefined } }]) {
    assert.throws(() => validateChatBody(body), ValidationError)
  }
})

test('chat message and serialized context limits include their exact boundary', () => {
  const context = { a: 'x'.repeat(MAX_CONTEXT_CHARS - 8) }
  assert.equal(JSON.stringify(context).length, MAX_CONTEXT_CHARS)
  validateChatBody({ mode: 'chat', message: 'x'.repeat(8_000), context })
  assert.throws(() => validateChatBody({ mode: 'chat', message: 'x'.repeat(8_001), context: {} }), ValidationError)
  assert.throws(() => validateChatBody({ mode: 'chat', message: 'Hi', context: { a: context.a + 'x' } }), ValidationError)
})

test('state validation limits the serialized document to 1MB of UTF-8 and requires a version', () => {
  const doc = { a: 'x'.repeat(MAX_DOC_BYTES - 8) }
  assert.equal(Buffer.byteLength(JSON.stringify(doc)), MAX_DOC_BYTES)
  assert.deepEqual(validateStateBody({ doc, base_updated_at: null }), { doc, base_updated_at: null })
  assert.throws(() => validateStateBody({ doc: { a: doc.a + 'x' }, base_updated_at: null }), ValidationError)
  assert.throws(() => validateStateBody({ doc: { a: '😀'.repeat(MAX_DOC_BYTES / 4) }, base_updated_at: null }), ValidationError)
  assert.throws(() => validateStateBody({ doc: {} }), ValidationError)
  assert.throws(() => validateStateBody({ base_updated_at: null }), ValidationError)
  assert.throws(() => validateStateBody({ doc: {}, base_updated_at: 123 }), ValidationError)
})

test('state doc must be a plain object, including for non-HTTP callers', () => {
  for (const doc of [null, [], 'text', 0, true, new Date(), new Map(), undefined]) {
    assert.throws(() => validateStateBody({ doc, base_updated_at: null }), ValidationError)
  }
  assert.deepEqual(validateStateBody({ doc: {}, base_updated_at: null }).doc, {})
})

test('history validates bounded transcript rows and round trips their presentation context', () => {
  const message = { id: 'line-1', role: 'agent', text: 'Send the worker emails to my inbox', at: Date.now(), scope: 'setup',
    cards: [{ kind: 'question', input: 'choice', set: 1, topics: ['workerHours'], choice: { yours: 'Forward worker emails', sample: 'Use sample worker time' } }],
    actions: [{ type: 'cover_topic', topic: 'workerHours' }], skipped: ['set_firm: invalid URL'], contextChip: 'Worker time', ingestFileIds: ['f_abcdefghijkl'] }
  const [stored] = validateChatHistory({ messages: [message] })
  assert.deepEqual(chatMessage(stored), message)
  assert.equal('actions' in stored, false, 'presentation fields live in the existing context column')
  for (const patch of [{ id: '../bad' }, { role: 'system' }, { text: 'x'.repeat(20_001) }, { at: Infinity }, { at: 9e15 }, { at: -1 },
    { cards: Array.from({ length: 4 }, () => ({})) }, { cards: ['not a card'] }, { skipped: ['x'.repeat(201)] }]) {
    assert.throws(() => validateChatHistory({ messages: [{ ...message, ...patch }] }), ValidationError)
  }
  assert.throws(() => validateChatHistory({ messages: [] }), ValidationError)
  assert.throws(() => validateChatHistory({ messages: Array.from({ length: 51 }, () => message) }), ValidationError)
})
