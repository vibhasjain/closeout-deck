import assert from 'node:assert/strict'
import test from 'node:test'
import { delegatePrompt, onboardPrompt, systemPrompt } from '../src/prompts.ts'

test('the Payroll profile always belongs to the staffing agency, not its client list', () => {
  for (const prompt of [systemPrompt({}), onboardPrompt({}), delegatePrompt({})]) {
    assert.match(prompt, /staffing agency’s single name, never its clients or sites/)
    assert.match(prompt, /sample agency is Summit Staffing/)
  }
})

test('server chat advertises only group decisions and explains their scope', () => {
  const prompt = systemPrompt({})
  assert.doesNotMatch(prompt, /decide\s*\{/)
  assert.match(prompt, /approve \{cycleId,groupId\}/)
  assert.match(prompt, /dismiss \{cycleId,groupId,reason\}/)
  assert.match(prompt, /never infer group consent from a single-entry request/)
})

test('E2E D4/D5/D8/D12/D13: prompts separate plans, offers and suggestions from what was said and saved', () => {
  const chat = systemPrompt({}), onboard = onboardPrompt({})
  // D12: a step request reads its handbook on that turn, so the trace frame is emitted.
  assert.match(chat, /use the Read tool on the matching handbook in that same turn, even if you read it earlier/)
  // D8: a source plan is never a load.
  assert.match(chat, /add_source records a plan in the profile and never loads time entries/)
  // D4: chat widening is a suggestion; the setup answer is consent; a retry re-sends what failed.
  assert.match(chat, /explicit answer to the authority goal is consent/)
  assert.match(chat, /Try saving that again/)
  assert.match(onboard, /never mention a briefing, channel or permission they did not choose/)
  // Owner decision: no invented or $0 weekly cap.
  assert.match(onboard, /include weeklyCap only when the user states a weekly total \(never 0, and never a default\)/)
  assert.doesNotMatch(onboard, /weeklyCap 0;/)
  // D5: missing sets come from data; plans are not data.
  assert.match(onboard, /context\.missingSets lists every set with no loaded time entries and no connected source/)
  assert.match(onboard, /context\.sources are setup plans, not data/)
  // D13: record only what was said or read on the firm site.
  assert.match(onboard, /Record only what the user said or what the firm pre-read states/)
  assert.doesNotMatch(onboard, /forward them to me\.'/)
  // H1: the agent's own words say time entries; the button keeps the owner's label.
  assert.match(chat, /call the first step getting time entries, never timesheets/)
  assert.doesNotMatch(chat, /is: get timesheets/)
})

test('E2E N14: the agent never promises a later follow-up; a logged dispute gets its recommendation in the same reply', () => {
  for (const prompt of [systemPrompt({}), delegatePrompt({})]) {
    assert.match(prompt, /never promise to do something later/)
    assert.match(prompt, /recommend Adjust \(the hours, the amount and why, from the evidence\) or Reject \(why\) in that reply, with the dispute form card/)
  }
})

test('QA R4-3: the agent names only controls that are shown, and says why when nobody can be asked', () => {
  for (const prompt of [systemPrompt({}), delegatePrompt({})]) {
    assert.match(prompt, /Name only buttons and controls the user can actually see, by their shown label: those on the card or form you attach, or on the current page/)
    assert.match(prompt, /When nobody can be asked, never tell the user to press Ask: say why \(no time entry is missing hours, or everyone left is on the never-contact list\) and offer the real next step/)
    assert.match(prompt, /Never refer to an ask or note as drafted or sent unless data\/threads\/ has it/)
  }
})
