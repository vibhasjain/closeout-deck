import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface WorkspaceUser {
  email: string
  name?: string
}

const handbooksSource = fileURLToPath(new URL('../handbooks/', import.meta.url))
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function workspacePath(email: string, env: NodeJS.ProcessEnv = process.env): string {
  const root = env.NODE_ENV === 'production'
    ? '/data'
    : env.CLOSEOUT_DATA_DIR || join(tmpdir(), 'closeout-agent')
  const account = createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16)
  return join(root, 'accounts', account)
}

/** Refresh server-owned account context on every turn, before starting Claude. */
export async function prepareWorkspace(
  user: WorkspaceUser,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const cwd = workspacePath(user.email, env)
  const handbooks = join(cwd, 'handbooks')
  await mkdir(handbooks, { recursive: true, mode: 0o700 })
  const oneLine = (value: string) => Array.from(value, character => character.charCodeAt(0) < 32 ? ' ' : character).join('')
  const account = [
    '# Account',
    '',
    `Email: ${oneLine(user.email)}`,
    `Name: ${oneLine(user.name || user.email)}`,
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Payroll profile not set up yet',
    '',
    '## Naming rules',
    '- Call yourself Closeout Agent.',
    '- Write Payroll with a capital P.',
    '- Call individual records time entries.',
    '- Use sentence case.',
    '',
  ].join('\n')
  await writeFile(join(cwd, 'CLAUDE.md'), account, { mode: 0o600 })
  const files = await readdir(handbooksSource, { withFileTypes: true })
  await Promise.all(files.filter(file => file.isFile() && file.name.endsWith('.md')).map(file =>
    copyFile(join(handbooksSource, file.name), join(handbooks, file.name)),
  ))
  return cwd
}

export async function readSessionId(cwd: string): Promise<string | null> {
  let contents: string
  try {
    contents = await readFile(join(cwd, 'session.json'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  try {
    const session = JSON.parse(contents) as { sessionId?: unknown }
    return typeof session?.sessionId === 'string' && uuid.test(session.sessionId) ? session.sessionId : null
  } catch {
    return null
  }
}

export async function writeSessionId(cwd: string, sessionId: string): Promise<void> {
  if (!uuid.test(sessionId)) throw new Error('Invalid Claude session ID')
  const temporary = join(cwd, `.session-${randomUUID()}.json`)
  await writeFile(temporary, JSON.stringify({ sessionId }) + '\n', { mode: 0o600 })
  await rename(temporary, join(cwd, 'session.json'))
}
