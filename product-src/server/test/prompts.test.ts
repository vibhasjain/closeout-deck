import assert from 'node:assert/strict'
import test from 'node:test'
import { systemPrompt } from '../src/prompts.ts'

test('server chat advertises only group decisions and explains their scope', () => {
  const prompt = systemPrompt({})
  assert.doesNotMatch(prompt, /decide\s*\{/)
  assert.match(prompt, /approve \{cycleId,groupId\}/)
  assert.match(prompt, /dismiss \{cycleId,groupId,reason\}/)
  assert.match(prompt, /never infer group consent from a single-entry request/)
})
