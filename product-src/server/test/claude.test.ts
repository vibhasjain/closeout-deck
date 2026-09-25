import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import test from 'node:test'
import { claudeArgs, claudeEnv, mapStreamLine, missingSession, runClaude, type ClaudeEvent } from '../src/claude.js'
import { readSessionId, writeSessionId } from '../src/workspace.js'

test('stream-json text deltas and results map to the existing SSE contract', () => {
  assert.deepEqual(mapStreamLine(JSON.stringify({ type: 'stream_event', event: {
    type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' },
  } }), 'fallback'), { text: 'Hello' })
  assert.deepEqual(mapStreamLine(JSON.stringify({ type: 'result', session_id: 'cli-id', result: 'Hello' }), 'fallback'),
    { done: true, sessionId: 'cli-id' })
  assert.deepEqual(mapStreamLine(JSON.stringify({ type: 'result', is_error: true, result: 'Failed' }), 'fallback'),
    { done: true, sessionId: 'fallback', error: 'Failed' })
  assert.deepEqual(mapStreamLine(JSON.stringify({ type: 'result', is_error: true, errors: ['One', 'Two'] }), 'fallback'),
    { done: true, sessionId: 'fallback', error: 'One\nTwo' })
  for (const ignored of ['{bad', 'null', '[]', '{"type":"system"}', JSON.stringify({ type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'private' } } })]) {
    assert.equal(mapStreamLine(ignored, 'fallback'), null)
  }
})

test('CLI arguments confine read tools to the workspace and refresh context on resume', () => {
  const args = claudeArgs('Current context', 'id', true, 'opus')
  for (const expected of ['--restricted', '--strict-mcp-config', '--disable-slash-commands', '--no-chrome']) {
    assert.ok(args.includes(expected))
  }
  for (const [flag, value] of [['--permission-mode', 'dontAsk'], ['--permission-prompts', 'none'],
    ['--system-prompt-snapshot', 'off'], ['--resume', 'id'], ['--append-system-prompt', 'Current context']]) {
    assert.equal(args[args.indexOf(flag!) + 1], value)
  }
  assert.deepEqual(args.slice(args.indexOf('--tools') + 1, args.indexOf('--tools') + 4), ['Read', 'Grep', 'Glob'])
  assert.deepEqual(args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--allowedTools') + 4), ['Read', 'Grep', 'Glob'])
  assert.ok(!args.includes('--dangerously-skip-permissions'))
  assert.ok(!args.includes('--session-id'))
  const env = { HOME: '/data', CLAUDE_CODE_OAUTH_TOKEN: 'test-token', CLAUDECODE: 'nested' }
  assert.deepEqual(claudeEnv(env), { HOME: '/data', CLAUDE_CODE_OAUTH_TOKEN: 'test-token' })
  assert.equal(env.CLAUDECODE, 'nested')
})

test('npm dependency bins cannot shadow the global Claude CLI', () => {
  const localBins = [
    '/repo/product-src/server/node_modules/.bin',
    '/repo/node_modules/.bin/',
    '/Users/dev/node_modules/.bin',
  ]
  const globalBins = ['/Users/dev/.local/bin', '/custom-node_modules/.bin', '/usr/local/bin', '/usr/bin']
  const env = {
    PATH: [...localBins, ...globalBins].join(delimiter),
    HOME: '/data', CLAUDE_CODE_OAUTH_TOKEN: 'test-token',
  }
  assert.deepEqual(claudeEnv(env), { ...env, PATH: globalBins.join(delimiter) })
  assert.equal(env.PATH, [...localBins, ...globalBins].join(delimiter))
})

const fakeCli = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync('calls.jsonl', JSON.stringify({args, cwd: process.cwd()}) + '\\n');
const resume = args.includes('--resume');
const id = args[args.indexOf(resume ? '--resume' : '--session-id') + 1];
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  if (process.env.FAKE_SCENARIO === 'missing' && resume) {
    process.stderr.write('No conversation found with session ID: ' + id);
    process.exitCode = 1;
    return;
  }
  if (process.env.FAKE_SCENARIO === 'always-missing') {
    send({type:'result', is_error:true, result:'No conversation found with session ID: ' + id});
    process.exitCode = 1;
    return;
  }
  const delta = JSON.stringify({type:'stream_event', event:{type:'content_block_delta', delta:{type:'text_delta',text:input}}});
  process.stdout.write(delta.slice(0, 15));
  setTimeout(() => {
    process.stdout.write(delta.slice(15) + '\\n');
    if (process.env.FAKE_SCENARIO === 'hang') { setInterval(() => {}, 1000); return; }
    // A terminal event without a trailing newline must still be parsed.
    process.stdout.write(JSON.stringify({type:'result',session_id:id}));
  }, 5);
});
`

async function fixture(t: { after: (cleanup: () => Promise<void>) => void }) {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'closeout-claude-test-')))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const command = join(cwd, 'fake-claude.mjs')
  await writeFile(command, fakeCli)
  await chmod(command, 0o700)
  const events: ClaudeEvent[] = []
  return {
    cwd, command, events,
    options: { cwd, command, message: 'Hello there', prompt: 'Current context', onEvent: (event: ClaudeEvent) => events.push(event) },
    calls: async () => (await readFile(join(cwd, 'calls.jsonl'), 'utf8')).trim().split('\n')
      .map(line => JSON.parse(line) as { args: string[]; cwd: string }),
  }
}

test('first turn persists a UUID; following turns resume it and parse split lines', async t => {
  const f = await fixture(t)
  await runClaude(f.options)
  const id = await readSessionId(f.cwd)
  assert.ok(id)
  assert.deepEqual(f.events, [{ text: 'Hello there' }, { done: true, sessionId: id }])
  await runClaude(f.options)
  const calls = await f.calls()
  assert.equal(calls.length, 2)
  assert.ok(calls[0]!.args.includes('--session-id'))
  assert.ok(calls[1]!.args.includes('--resume'))
  assert.ok(calls.every(call => call.cwd === f.cwd && call.args.includes(id)))
  assert.equal(await readSessionId(f.cwd), id)
})

test('a missing resumed session retries once with a new persisted UUID', async t => {
  const f = await fixture(t)
  const old = randomUUID()
  await writeSessionId(f.cwd, old)
  await runClaude({ ...f.options, env: { ...process.env, FAKE_SCENARIO: 'missing' } })
  const id = await readSessionId(f.cwd)
  assert.notEqual(id, old)
  assert.deepEqual(f.events, [{ text: 'Hello there' }, { done: true, sessionId: id }])
  const calls = await f.calls()
  assert.equal(calls.length, 2)
  assert.ok(calls[0]!.args.includes('--resume'))
  assert.ok(calls[0]!.args.includes(old))
  assert.ok(calls[1]!.args.includes('--session-id'))
  assert.ok(calls[1]!.args.includes(id!))
})

test('session recovery is bounded to one retry and emits one final error', async t => {
  const f = await fixture(t)
  await writeSessionId(f.cwd, randomUUID())
  await runClaude({ ...f.options, env: { ...process.env, FAKE_SCENARIO: 'always-missing' } })
  assert.equal((await f.calls()).length, 2)
  assert.equal(f.events.length, 1)
  assert.ok('done' in f.events[0]! && f.events[0].error)
  assert.equal(missingSession('An unrelated file was not found'), false)
})

test('client abort kills the running CLI and emits no terminal event to the closed stream', async t => {
  const f = await fixture(t)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  t.after(async () => clearTimeout(timeout))
  await runClaude({
    ...f.options, signal: controller.signal, env: { ...process.env, FAKE_SCENARIO: 'hang' },
    onEvent: event => { f.events.push(event); controller.abort() },
  })
  assert.deepEqual(f.events, [{ text: 'Hello there' }])
  assert.equal((await f.calls()).length, 1)
})
