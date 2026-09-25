/** Manual live eval: expects two real local dev servers on ports 8796 and 8797. */
import { mkdir, writeFile } from 'node:fs/promises'
const folder = new URL('../.data/p6-eval/', import.meta.url)
await mkdir(folder, { recursive: true })
const scenarios = [
  { id: 'email', port: 8796, answer: 'We run weekly Payroll: Sunday week end, hours due Monday, Payroll closes Wednesday and payday Friday. We get timesheets by email. Workers email photos to our Payroll inbox; I can forward them every Monday.' },
  { id: 'fieldglass', port: 8797, answer: 'We run weekly Payroll: Sunday week end, hours due Monday, Payroll closes Wednesday and payday Friday. Clients send approved hours through Fieldglass. Workers do not report hours separately. I can schedule the approved-hours export to be forwarded each Monday.' },
]
const answerByTopic = {
  calendar: 'Weekly, Sunday period end, hours due Monday, Payroll closes Wednesday, paid Friday. That is our main calendar.',
  workerHours: 'Workers email their hours to our Payroll inbox. I can forward those every Monday; collect actual files during our first closeout.',
  clientHours: 'Site supervisors email an approved spreadsheet each Monday. I can forward those approved hours to you along with the worker reports.',
  whoseHours: 'Compare both and ask me about gaps. Pay the worker-reported hours unless we have evidence supporting a correction; always ask before reducing them. Bill the client-approved hours.',
  rates: 'Our pay rates and client rules are in rate-card spreadsheets and signed client contracts. I can upload them during our first closeout. California and Texas are right. No other special pay policies yet.',
  complaints: 'Workers email Payroll when pay looks wrong. I, the Payroll operator, own those complaints, and can forward them to you. Phone complaints become a note here.',
  authority: 'Ask me before fixing anything for now, no autonomous spending. Text supervisors only after I approve the message; do not text workers. Never contact Jordan Smith. I will confirm these settings in the Rulebook.',
}
await Promise.all(scenarios.map(async scenario => {
  const context = { firm: { domain: 'sample', name: 'Pacific Cold Storage / Lonestar Packaging', states: ['CA', 'TX'], verticals: ['Light industrial'] }, profile: {}, covered: [] }
  const transcript = []
  let message = 'Start onboarding'
  for (let turn = 0; turn < 12; turn += 1) {
    const response = await fetch(`http://127.0.0.1:${scenario.port}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(190_000),
      body: JSON.stringify({ mode: 'onboard', message, context }),
    })
    const raw = await response.text()
    const events = raw.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5)))
    const done = events.findLast(event => event.done)
    const text = done?.final ?? events.map(event => event.text ?? '').join('')
    const actions = [...text.matchAll(/```action\s+([^]*?)```/g)].map(match => JSON.parse(match[1]))
    const cards = [...text.matchAll(/```card\s+([^]*?)```/g)].map(match => JSON.parse(match[1]))
    const card = cards[0]
    transcript.push({ turn: turn + 1, user: message, context: structuredClone(context), status: response.status, sessionId: done?.sessionId, agent: text, error: done?.error, cards, actions })
    await writeFile(new URL(`${scenario.id}-success.json`, folder), JSON.stringify(transcript, null, 2))
    console.log(JSON.stringify({ scenario: scenario.id, turn: turn + 1, sessionId: done?.sessionId, error: done?.error, question: text.replace(/```[^]*?```/g, '').trim(), card, actions }))
    if (done?.error || !card || cards.length !== 1) break
    for (const action of actions) {
      if (action.type === 'cover_topic' && !context.covered.includes(action.topic)) context.covered.push(action.topic)
      if (action.type === 'set_profile') context.profile[action.field] = action.value
      if (action.type === 'set_firm') Object.assign(context.firm, action.patch)
    }
    if (card.kind === 'onboard_complete') break
    if (turn === 0) message = scenario.answer
    else {
      const topic = card.topics?.find(topic => !context.covered.includes(topic)) ?? card.topics?.[0]
      if (scenario.id === 'fieldglass' && topic === 'workerHours') message = 'Workers only clock in through the client, and we have no separate worker-reported source. Use the client-approved Fieldglass export; I can arrange a scheduled forward.'
      else if (scenario.id === 'fieldglass' && topic === 'clientHours') message = 'Fieldglass approvals arrive each Monday. I can schedule its approved-hours CSV export to be forwarded. We can set up that connection during our first closeout.'
      else message = answerByTopic[topic] ?? 'Those details are right. Use the conservative defaults for anything we have not covered; we can adjust during the first closeout.'
    }
  }
}))
