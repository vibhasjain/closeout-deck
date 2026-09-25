/** Real local CLI/HTTP eval with the actual frontend onboarding state, actions and Finish flow.
 * Run from product-src/server: node --import tsx eval/onboard.mjs
 * No browser, screenshots, cloud state, or mocked agent responses.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { createServer as createViteServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from '../src/index.ts'
import { createMemoryDataStore } from '../src/datastore.ts'
import { conditionalState } from '../src/state.ts'
import { SAMPLE_FIRM } from '../src/firm.ts'
import { getClaudeVersion } from '../src/claude.ts'
import { workspacePath } from '../src/workspace.ts'

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const productRoot = resolve(serverRoot, '..')
const arg = (name) => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1] }
const runDir = arg('--run-dir') ?? join(serverRoot, '.data', `p6-fixes-eval-${new Date().toISOString().replace(/[:.]/g, '-')}`)
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
await mkdir(runDir, { recursive: true })

if (!arg('--scenario')) {
  await Promise.all(scenarios.map(scenario => new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--scenario', scenario.id, '--run-dir', runDir], { cwd: serverRoot, stdio: 'inherit' })
    child.once('error', fail)
    child.once('exit', code => code === 0 ? done() : fail(new Error(`${scenario.id} eval exited ${code}`)))
  })))
  const results = await Promise.all(scenarios.map(scenario => readFile(join(runDir, `${scenario.id}.json`), 'utf8').then(JSON.parse)))
  const lines = ['# P6 fixes: live onboarding verification', '', `Run: ${new Date().toISOString()}. Actual local Claude CLI (${results[0].claudeVersion}), model alias opus. No mocked agent, browser, screenshots, cloud writes or deployment.`, '',
    'The runner loads the real frontend modules through Vite SSR, uses the real requestOnboarding/applyOnboardReply/finishOnboarding functions, and exercises HTTP/SSE against isolated local servers. An in-memory state adapter runs the real conditionalState version checks, and closeout_chat uses the in-memory data adapter. Each scenario has a fresh account workspace. The same CLI session is retained through Finish.', '',
    'Command: `cd product-src/server && node --import tsx eval/onboard.mjs`', '', `Full transcripts, state, HTTP payloads and rendered writing markup: \`${runDir}\` (ignored).`, '',
    'Rendering evidence is React server rendering of the actual WritingProfile component; it proves the closing line is present in markup. It is not a browser or 390 px visual check.', '']
  for (const result of results) {
    lines.push(`## ${result.id === 'email' ? 'Email photos' : 'Fieldglass exports'}`, '',
      `Session: \`${result.sessionId}\`; ${result.transcript.length} onboarding turns plus one Finish turn. State document: ${result.stateBytes} bytes. All seven goals covered; authority is ask-first; never-contact includes Jordan Smith.`, '',
      `Inbox: \`${result.inbox}\`. Closing line present in writing markup and persisted chat: **yes**. Kickoff choice sets: **${result.kickoff.cards.map(card => card.set).join(', ')}**, matching missing sets **${result.missingSets.join(', ')}**.`, '',
      '**Forwarding ask:**', '', `> User: ${result.forwarding.user}`, `> Agent: ${result.forwarding.question}`, '',
      '**Saved source plan:**', '', ...result.sources.filter(source => source.how?.includes(result.inbox)).map(source => `- Set ${source.set}: ${source.how}`), '',
      '**Agent closing line, displayed in WritingProfile and saved to chat:**', '', `> ${result.closing}`, '',
      '**Agent-generated Finish kickoff:**', '', `> ${result.kickoff.text}`, '',
      ...result.kickoff.cards.map(card => `- Set ${card.set}: **${card.choice.yours}** / **${card.choice.sample}**`), '',
      '**Question sequence:**', '', ...result.transcript.map(turn => `- ${turn.turn}. ${turn.question} (${turn.card.kind === 'question' ? turn.card.topics.join(', ') : 'onboard_complete'})`), '')
  }
  await writeFile(join(serverRoot, 'P6-FIXES-LIVE-EVAL.md'), lines.join('\n') + '\n')
  console.log(`REPORT ${join(serverRoot, 'P6-FIXES-LIVE-EVAL.md')}`)
} else {
  const scenario = scenarios.find(item => item.id === arg('--scenario'))
  assert.ok(scenario, 'known scenario')
  const email = 'dev@hypertrack.io', local = new Map(), requests = [], captures = []
  globalThis.localStorage = { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)), removeItem: key => local.delete(key), clear: () => local.clear() }
  localStorage.setItem('closeout:session:v1', JSON.stringify({ email, name: 'Dev Payroll', sessionToken: 'local-eval-only', exp: Date.now() / 1000 + 3600 }))
  const env = { ...process.env, NODE_ENV: 'development', CLOSEOUT_DEV_EMAIL: email, ALLOWED_DOMAINS: 'hypertrack.io',
    SESSION_SECRET: 'local-eval-only-secret-at-least-thirty-two-bytes', CLOSEOUT_DATA_DIR: join(runDir, scenario.id),
    SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', CLOSEOUT_AGENT_MODEL: 'opus' }
  let stateRow = null
  const store = createMemoryDataStore()
  const server = createServer({ env, dataStore: store, stateStore: {
    get: async () => stateRow,
    put: async (_email, doc, version) => {
      const result = conditionalState(stateRow, structuredClone(doc), version)
      if (result.kind === 'conflict') return { status: 409, row: result.row }
      stateRow = result.row
      return { status: 200, row: stateRow }
    },
  } })
  await new Promise((done, fail) => { server.once('error', fail); server.listen(scenario.port, '127.0.0.1', done) })
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const target = typeof input === 'string' ? input : input.url
    if (!target.startsWith('/api')) return originalFetch(input, init)
    const headers = new Headers(init?.headers); headers.delete('Authorization')
    const body = init?.body ? JSON.parse(String(init.body)) : null
    const response = await originalFetch(`http://127.0.0.1:${scenario.port}${target.slice(4)}`, { ...init, headers })
    if (target === '/api/chat') {
      const entry = { body, status: response.status }; requests.push(entry)
      captures.push(response.clone().text().then(raw => { entry.raw = raw; entry.events = raw.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6))) }))
    }
    return response
  }
  let vite
  const transcript = []
  try {
    vite = await createViteServer({ root: productRoot, configFile: join(productRoot, 'vite.config.ts'), server: { middlewareMode: true, hmr: { port: scenario.port + 100 } }, appType: 'custom', logLevel: 'error' })
    const onboarding = await vite.ssrLoadModule('/src/lib/onboarding.ts')
    const flow = await vite.ssrLoadModule('/src/lib/onboardingFlow.ts')
    const { WritingProfile } = await vite.ssrLoadModule('/src/pages/setup/Agent.tsx')
    await onboarding.hydrateOnboarding()
    assert.equal(stateRow, null, 'first hydrate does not push defaults')
    onboarding.updateOnboarding({ firm: structuredClone(SAMPLE_FIRM), setupStep: 'conversation' })
    const inbox = onboarding.inboxAddress(email)
    let message = 'Start onboarding', askedAddress = false
    for (let turn = 0; turn < 14; turn++) {
      const current = onboarding.getOnboarding()
      if (current.setupHistory.length) {
        const history = [...current.setupHistory], index = history.length - 1
        history[index] = { ...history[index], answer: message }
        onboarding.updateOnboarding({ setupHistory: history })
      }
      onboarding.updateOnboarding({ setupRequest: message })
      const reply = await flow.requestOnboarding(message, AbortSignal.timeout(200_000))
      flow.applyOnboardReply(reply)
      await onboarding.flushOnboarding()
      await Promise.all(captures)
      transcript.push({ turn: turn + 1, user: message, ...reply })
      await writeFile(join(runDir, `${scenario.id}-progress.json`), JSON.stringify({ transcript, requests }, null, 2))
      console.log(JSON.stringify({ scenario: scenario.id, turn: turn + 1, question: reply.question, topics: reply.card.topics, card: reply.card.kind, skipped: reply.skipped }))
      if (reply.card.kind === 'onboard_complete') break
      if (turn === 0) message = scenario.answer
      else if (!askedAddress && !transcript.some(item => item.question.includes(inbox))) {
        askedAddress = true
        message = 'Before we move on, what address should I forward those reports to? Please offer the forwarding plan, then continue with the next missing detail.'
      } else {
        const topic = reply.card.topics.find(item => !onboarding.getOnboarding().covered.includes(item)) ?? reply.card.topics[0]
        if (scenario.id === 'fieldglass' && topic === 'workerHours') message = 'Workers only clock in through the client, and we have no separate worker-reported source. Use the client-approved Fieldglass export; I can arrange a scheduled forward.'
        else if (scenario.id === 'fieldglass' && topic === 'clientHours') message = 'Fieldglass approvals arrive each Monday. I can schedule its approved-hours CSV export to be forwarded. We can set up that connection during our first closeout.'
        else if (scenario.id === 'fieldglass' && topic === 'whoseHours') message = 'Pay and bill the client-approved Fieldglass hours because workers do not separately report hours. Ask me about gaps or any proposed reduction; use location evidence when available.'
        else message = answerByTopic[topic] ?? 'Use the conservative defaults for anything we have not covered; we can adjust during the first closeout.'
      }
    }
    const ready = onboarding.getOnboarding()
    assert.equal(ready.setupStep, 'writing', 'agent emitted onboard_complete')
    assert.equal(new Set(ready.covered).size, 7, 'all seven goals covered')
    assert.ok(ready.setupClosing, 'actual closing line saved')
    const markup = renderToStaticMarkup(React.createElement(WritingProfile, { state: ready, onDone() {} }))
    const escaped = ready.setupClosing.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
    assert.ok(markup.includes(escaped), 'actual WritingProfile renders closing line')
    await writeFile(join(runDir, `${scenario.id}-writing.html`), markup)
    const forwarding = transcript.find(turn => turn.question.includes(inbox))
    assert.ok(forwarding, 'forwarding ask includes actual per-account inbox')
    assert.ok(ready.sources.some(source => source.how?.includes(inbox)), 'source plan retains inbox')
    const missingSets = [1, 2, 3].filter(set => !ready.sources.some(source => source.set === set))
    await flow.finishOnboarding(ready.neverContact ?? [])
    await onboarding.flushOnboarding()
    await Promise.all(captures)
    const finished = onboarding.getOnboarding()
    const kickoff = finished.chat.find(item => item.id === 'onboard-first-closeout')
    assert.ok(finished.forwarded && kickoff, 'actual Finish stores kickoff and enables Payroll')
    assert.deepEqual(kickoff.cards.map(card => card.set).sort(), missingSets)
    const sessionIds = requests.map(request => request.events.findLast(event => event.done)?.sessionId)
    assert.ok(sessionIds.every(id => id && id === sessionIds[0]), 'one real CLI session across onboarding and kickoff')
    for (let attempt = 0; attempt < 50 && (await store.listChat(email)).length < 2; attempt++) await new Promise(done => setTimeout(done, 20))
    const chat = await store.listChat(email)
    assert.ok(chat.some(line => line.id === 'onboard-closing' && line.text === ready.setupClosing), 'closing appended to server chat')
    assert.ok(chat.some(line => line.id === 'onboard-first-closeout'), 'kickoff appended to server chat')
    assert.ok(!('chat' in stateRow.doc), 'chat excluded from state doc')
    const stateBytes = Buffer.byteLength(JSON.stringify(stateRow.doc))
    assert.ok(stateBytes < 100_000, 'canonical state stays well under 1 MiB')
    const profile = JSON.parse(await readFile(join(workspacePath(email, env), 'payroll-profile.json'), 'utf8'))
    assert.equal(profile.inbox, inbox)
    assert.equal(profile.authority.autoFix, false)
    assert.ok(profile.neverContact.includes('Jordan Smith'))
    const result = { id: scenario.id, claudeVersion: await getClaudeVersion(env), sessionId: sessionIds[0], inbox, transcript, requests, sources: finished.sources,
      forwarding, closing: ready.setupClosing, kickoff, missingSets, stateBytes, canonical: stateRow.doc, workspaceProfile: profile, chat }
    await writeFile(join(runDir, `${scenario.id}.json`), JSON.stringify(result, null, 2))
    console.log(JSON.stringify({ scenario: scenario.id, complete: true, sessionId: result.sessionId, stateBytes, kickoff: kickoff.text, sets: missingSets }))
  } catch (error) {
    await writeFile(join(runDir, `${scenario.id}-failure.json`), JSON.stringify({ error: String(error), transcript, requests }, null, 2))
    throw error
  } finally {
    if (vite) await vite.close()
    globalThis.fetch = originalFetch
    server.closeAllConnections()
    await new Promise(done => server.close(done))
  }
}
