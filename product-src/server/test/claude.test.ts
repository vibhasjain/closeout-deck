import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import test from 'node:test'
import { AGENT_ERROR, claudeArgs, claudeEnv, createStreamMapper, mapStreamLine, runClaude, type ClaudeEvent } from '../src/claude.js'
import { readSessionId, writeSessionId } from '../src/workspace.js'

test('stream-json text deltas and final text map to SSE, with fixed public errors', () => {
  assert.deepEqual(mapStreamLine(JSON.stringify({ type: 'stream_event', event: {
    type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' },
  } }), 'fallback'), { text: 'Hello' })
  assert.deepEqual(mapStreamLine(JSON.stringify({ type: 'result', session_id: 'cli-id', result: 'Hello' }), 'fallback'),
    { done: true, sessionId: 'cli-id', final: 'Hello' })
  assert.deepEqual(mapStreamLine(JSON.stringify({ type: 'result', result: '' }), 'fallback'),
    { done: true, sessionId: 'fallback', final: '' })
  assert.deepEqual(mapStreamLine(JSON.stringify({ type: 'result', is_error: true, result: 'Private failure' }), 'fallback'),
    { done: true, sessionId: 'fallback', error: AGENT_ERROR })
  assert.deepEqual(mapStreamLine(JSON.stringify({ type: 'result', is_error: true, errors: ['One', 'Two'] }), 'fallback'),
    { done: true, sessionId: 'fallback', error: AGENT_ERROR })
  for (const ignored of ['{bad', 'null', '[]', '{"type":"system"}', JSON.stringify({ type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'private' } } })]) {
    assert.equal(mapStreamLine(ignored, 'fallback'), null)
  }
})

test('multiple assistant text blocks around tool_use produce A\\n\\nB and the authoritative final', () => {
  const map = createStreamMapper('session')
  const records = [
    { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text', text: '' } } },
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'A' } } },
    { type: 'stream_event', event: { type: 'content_block_stop' } },
    { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Read' } } },
    { type: 'stream_event', event: { type: 'content_block_stop' } },
    { type: 'stream_event', event: { type: 'message_stop' } },
    { type: 'stream_event', event: { type: 'message_start' } },
    { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text', text: '' } } },
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'B' } } },
    { type: 'result', result: 'Final B' },
  ]
  const events = records.map(record => map(JSON.stringify(record))).filter(event => event !== null)
  assert.deepEqual(events, [{ text: 'A' }, { text: '\n\n' }, { text: 'B' },
    { done: true, sessionId: 'session', final: 'Final B' }])
  assert.equal(events.filter(event => 'text' in event).map(event => event.text).join(''), 'A\n\nB')
})

test('CLI arguments confine read tools, refresh resumed context and cap the turn budget', () => {
  const args = claudeArgs('Current context', 'id', true, 'opus')
  for (const expected of ['--restricted', '--strict-mcp-config', '--disable-slash-commands', '--no-chrome']) {
    assert.ok(args.includes(expected))
  }
  for (const [flag, value] of [['--permission-mode', 'dontAsk'], ['--permission-prompts', 'none'],
    ['--system-prompt-snapshot', 'off'], ['--resume', 'id'], ['--append-system-prompt', 'Current context'],
    ['--max-budget-usd', '2']]) {
    assert.equal(args[args.indexOf(flag!) + 1], value)
  }
  assert.deepEqual(args.slice(args.indexOf('--tools') + 1, args.indexOf('--tools') + 4), ['Read', 'Grep', 'Glob'])
  assert.deepEqual(args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--allowedTools') + 4), ['Read', 'Grep', 'Glob'])
  assert.ok(!args.includes('--dangerously-skip-permissions'))
  assert.ok(!args.includes('--session-id'))
})

test('child env only contains six allowed keys, including keychain account identity; server secrets never reach it', () => {
  const allowed = { PATH: '/usr/bin', HOME: '/data', USER: 'dev', LANG: 'en_US.UTF-8', TZ: 'UTC', CLAUDE_CODE_OAUTH_TOKEN: 'test-token' }
  const secrets = {
    CLAUDECODE: 'nested', SESSION_SECRET: 'session', SUPABASE_URL: 'url', SUPABASE_SERVICE_KEY: 'service',
    SUPABASE_ANON_KEY: 'anon', OPENAI_API_KEY: 'openai', GOOGLE_CLIENT_ID: 'google', UNLISTED_SECRET: 'other',
  }
  const env = { ...allowed, ...secrets }
  assert.deepEqual(claudeEnv(env), allowed)
  for (const key of Object.keys(secrets)) assert.equal(claudeEnv(env)[key], undefined)
  assert.equal(env.CLAUDECODE, 'nested')
})

test('npm dependency bins cannot shadow the global Claude CLI', () => {
  const localBins = ['/repo/product-src/server/node_modules/.bin', '/repo/node_modules/.bin/', '/Users/dev/node_modules/.bin']
  const globalBins = ['/Users/dev/.local/bin', '/custom-node_modules/.bin', '/usr/local/bin', '/usr/bin']
  const env = { PATH: [...localBins, ...globalBins].join(delimiter), HOME: '/data', CLAUDE_CODE_OAUTH_TOKEN: 'test-token' }
  assert.deepEqual(claudeEnv(env), { ...env, PATH: globalBins.join(delimiter) })
  assert.equal(env.PATH, [...localBins, ...globalBins].join(delimiter))
})

const fakeCli = `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync('calls.jsonl', JSON.stringify({args, cwd: process.cwd(), envKeys: Object.keys(process.env), pid: process.pid}) + '\\n');
const scenario = readFileSync('scenario', 'utf8');
const resume = args.includes('--resume');
const id = args[args.indexOf(resume ? '--resume' : '--session-id') + 1];
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  if (scenario === 'trace-retry') {
    for (const file of ['handbooks/ingest.md', ...Array.from({length:3}, (_, n) => 'data/' + (resume ? 'resume' : 'fresh') + n + '.json')]) {
      send({type:'assistant', message:{content:[{type:'tool_use',name:'Read',input:{file_path:file}}]}});
    }
  }
  if (resume && ['missing', 'prompt-too-long', 'retry-then-hang', 'trace-retry'].includes(scenario)) {
    process.stderr.write(scenario === 'missing' ? 'No conversation found with session ID: ' + id : 'Prompt is too long');
    process.exitCode = 1;
    return;
  }
  if (scenario === 'always-fail') {
    process.stderr.write('First CLI failure line\\nPrivate diagnostic second line');
    send({type:'result', is_error:true, result:'Provider private error'});
    process.exitCode = 7;
    return;
  }
  if (scenario === 'result-error' && resume) {
    send({type:'result', is_error:true, result:'Prompt is too long'});
    return;
  }
  if (scenario === 'no-result' && resume) return;
  const delta = JSON.stringify({type:'stream_event', event:{type:'content_block_delta', delta:{type:'text_delta',text:input}}});
  process.stdout.write(delta.slice(0, 15));
  setTimeout(() => {
    process.stdout.write(delta.slice(15) + '\\n');
    if (scenario === 'hang' || scenario === 'retry-then-hang') { setInterval(() => {}, 1000); return; }
    if (scenario === 'fail-after-output') {
      process.stderr.write('Failure after output');
      process.exitCode = 1;
      return;
    }
    process.stdout.write(JSON.stringify({type:'result',session_id:id,result:input}));
  }, 5);
});
`

async function fixture(t: { after: (cleanup: () => Promise<void>) => void }, scenario = '') {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'closeout-claude-test-')))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const command = join(cwd, 'fake-claude.mjs')
  await writeFile(command, fakeCli)
  await writeFile(join(cwd, 'scenario'), scenario)
  await chmod(command, 0o700)
  const events: ClaudeEvent[] = []
  return {
    cwd, command, events,
    options: { cwd, command, message: 'Hello there', prompt: 'Current context', onEvent: (event: ClaudeEvent) => events.push(event) },
    calls: async () => (await readFile(join(cwd, 'calls.jsonl'), 'utf8')).trim().split('\n')
      .map(line => JSON.parse(line) as { args: string[]; cwd: string; envKeys: string[]; pid: number }),
  }
}

test('first turn persists a UUID; following turns resume it and parse split lines', async t => {
  const f = await fixture(t)
  await runClaude(f.options)
  const id = await readSessionId(f.cwd)
  assert.ok(id)
  assert.deepEqual(f.events, [{ text: 'Hello there' }, { done: true, sessionId: id, final: 'Hello there' }])
  await runClaude(f.options)
  const calls = await f.calls()
  assert.equal(calls.length, 2)
  assert.ok(calls[0]!.args.includes('--session-id'))
  assert.ok(calls[1]!.args.includes('--resume'))
  assert.ok(calls.every(call => call.cwd === f.cwd && call.args.includes(id)))
  assert.equal(await readSessionId(f.cwd), id)
})

for (const scenario of ['missing', 'prompt-too-long', 'result-error', 'no-result']) {
  test(`resume failure before text retries once with a fresh persisted id: ${scenario}`, async t => {
    const f = await fixture(t, scenario)
    const logs = t.mock.method(console, 'warn', () => {})
    t.mock.method(console, 'error', () => {})
    const old = randomUUID()
    await writeSessionId(f.cwd, old)
    await runClaude(f.options)
    const id = await readSessionId(f.cwd)
    assert.notEqual(id, old)
    assert.deepEqual(f.events, [{ text: 'Hello there' }, { done: true, sessionId: id, final: 'Hello there' }])
    const calls = await f.calls()
    assert.equal(calls.length, 2)
    assert.ok(calls[0]!.args.includes('--resume'))
    assert.ok(calls[0]!.args.includes(old))
    assert.ok(calls[1]!.args.includes('--session-id'))
    assert.ok(calls[1]!.args.includes(id!))
    assert.equal(logs.mock.callCount(), 1)
    if (scenario === 'prompt-too-long' || scenario === 'result-error') {
      assert.equal(logs.mock.calls[0]!.arguments[1], 'Prompt is too long')
    }
  })
}

test('session recovery is bounded; failures log exit/first stderr line and send only a fixed error', async t => {
  const f = await fixture(t, 'always-fail')
  const logs = t.mock.method(console, 'error', () => {})
  t.mock.method(console, 'warn', () => {})
  await writeSessionId(f.cwd, randomUUID())
  await runClaude(f.options)
  assert.equal((await f.calls()).length, 2)
  assert.deepEqual(f.events, [{ done: true, sessionId: await readSessionId(f.cwd), error: AGENT_ERROR }])
  assert.equal(logs.mock.callCount(), 2)
  assert.ok(logs.mock.calls.every(call => call.arguments[0] === 'Closeout Agent CLI failed: exit=7 stderr=First CLI failure line'))
  assert.ok(!JSON.stringify(f.events).includes('Provider private error'))
})

test('a resume failure after text output does not retry or replace the stored session', async t => {
  const f = await fixture(t, 'fail-after-output')
  t.mock.method(console, 'error', () => {})
  const old = randomUUID()
  await writeSessionId(f.cwd, old)
  await runClaude(f.options)
  assert.equal((await f.calls()).length, 1)
  assert.equal(await readSessionId(f.cwd), old)
  assert.deepEqual(f.events, [{ text: 'Hello there' }, { done: true, sessionId: old, error: AGENT_ERROR }])
})

test('configured budget reaches the CLI argument without passing server env or secrets', async t => {
  const f = await fixture(t)
  await runClaude({ ...f.options, env: { ...process.env, CLOSEOUT_TURN_BUDGET_USD: '0.75',
    SESSION_SECRET: 'private', SUPABASE_SERVICE_KEY: 'private', OPENAI_API_KEY: 'private', GOOGLE_CLIENT_ID: 'private' } })
  const call = (await f.calls())[0]!
  assert.equal(call.args[call.args.indexOf('--max-budget-usd') + 1], '0.75')
  for (const key of ['CLOSEOUT_TURN_BUDGET_USD', 'SESSION_SECRET', 'SUPABASE_SERVICE_KEY', 'OPENAI_API_KEY', 'GOOGLE_CLIENT_ID']) {
    assert.ok(!call.envKeys.includes(key), key)
  }
})

test('client abort kills the running CLI and emits no terminal event to the closed stream', async t => {
  const f = await fixture(t, 'hang')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  t.after(async () => clearTimeout(timeout))
  await runClaude({ ...f.options, signal: controller.signal,
    onEvent: event => { f.events.push(event); controller.abort() } })
  assert.deepEqual(f.events, [{ text: 'Hello there' }])
  assert.equal((await f.calls()).length, 1)
})

for (const timeoutMs of [undefined, 5_000]) {
  test(`wall-clock timeout kills CLI and sends done+fixed error at ${timeoutMs ?? 180_000}ms`, async t => {
    const f = await fixture(t, 'hang')
    const logs = t.mock.method(console, 'error', () => {})
    t.mock.timers.enable({ apis: ['setTimeout'] })
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    const running = runClaude({ ...f.options, timeoutMs, onEvent: event => { f.events.push(event); started() } })
    await ready
    t.mock.timers.tick((timeoutMs ?? 180_000) - 1)
    assert.deepEqual(f.events, [{ text: 'Hello there' }])
    t.mock.timers.tick(1)
    await running
    const calls = await f.calls()
    assert.equal(calls.length, 1)
    assert.throws(() => process.kill(calls[0]!.pid, 0), { code: 'ESRCH' })
    assert.deepEqual(f.events, [{ text: 'Hello there' }, { done: true, sessionId: await readSessionId(f.cwd), error: AGENT_ERROR }])
    assert.ok(logs.mock.calls.some(call => call.arguments[0] === `Closeout Agent turn timed out after ${timeoutMs ?? 180_000}ms`))
    t.mock.timers.tick(180_000)
    assert.equal(f.events.length, 2)
  })
}


test('fresh-session recovery shares the original wall-clock deadline', async t => {
  const f = await fixture(t, 'retry-then-hang')
  await writeSessionId(f.cwd, randomUUID())
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(console, 'error', () => {})
  t.mock.method(console, 'warn', () => { t.mock.timers.tick(4_000) })
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  const running = runClaude({ ...f.options, timeoutMs: 5_000,
    onEvent: event => { f.events.push(event); started() } })
  await ready
  t.mock.timers.tick(999)
  assert.deepEqual(f.events, [{ text: 'Hello there' }])
  t.mock.timers.tick(1)
  await running
  assert.equal((await f.calls()).length, 2)
  assert.deepEqual(f.events, [{ text: 'Hello there' }, { done: true, sessionId: await readSessionId(f.cwd), error: AGENT_ERROR }])
})


test('data traces and handbook deduplication span a failed resume and its fresh attempt', async t => {
  const f = await fixture(t, 'trace-retry')
  await writeSessionId(f.cwd, randomUUID())
  await runClaude(f.options)
  assert.equal((await f.calls()).length, 2)
  const traces = f.events.filter((event): event is { trace: string } => 'trace' in event).map(event => event.trace)
  assert.deepEqual(traces, ['Read handbooks/ingest.md', 'Read data/resume0.json', 'Read data/resume1.json', 'Read data/resume2.json'])
  assert.equal(f.events.filter(event => 'done' in event).length, 1)
})
