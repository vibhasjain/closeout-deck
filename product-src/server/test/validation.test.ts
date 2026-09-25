import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_CONTEXT_CHARS, MAX_DOC_BYTES, MODES, validateChatBody, validateStateBody, ValidationError } from '../src/validation.ts'

test('chat validation accepts each known mode and keeps message and context intact', () => {
  for (const mode of MODES) {
    const body = { mode, message: ' Hi ', context: { page: '/payroll', count: 3 } }
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
  const doc = 'x'.repeat(MAX_DOC_BYTES - 2)
  assert.deepEqual(validateStateBody({ doc, base_updated_at: null }), { doc, base_updated_at: null })
  assert.throws(() => validateStateBody({ doc: doc + 'x', base_updated_at: null }), ValidationError)
  assert.throws(() => validateStateBody({ doc: '😀'.repeat(MAX_DOC_BYTES / 4), base_updated_at: null }), ValidationError)
  assert.throws(() => validateStateBody({ doc: {} }), ValidationError)
  assert.throws(() => validateStateBody({ base_updated_at: null }), ValidationError)
  assert.throws(() => validateStateBody({ doc: {}, base_updated_at: 123 }), ValidationError)
})
