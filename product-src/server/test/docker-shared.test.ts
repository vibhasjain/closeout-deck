// Every client module the server imports must be shipped in the Docker image.
// On Sep 25 2026 a missing src/lib/inbox.ts crash-looped production on boot.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const serverDir = join(import.meta.dirname, '..')
const productDir = join(serverDir, '..')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sources(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : [])
}

test('every shared client module the server imports is copied into the image and not dockerignored', () => {
  const shared = new Set<string>()
  for (const file of sources(join(serverDir, 'src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/from '(?:\.\.\/)+(src\/[^']+)'/g)) shared.add(match[1])
  }
  const dockerfile = readFileSync(join(serverDir, 'Dockerfile'), 'utf8')
  const ignore = readFileSync(join(productDir, '.dockerignore'), 'utf8')
  for (const path of shared) {
    assert.ok(dockerfile.includes(path), `Dockerfile does not COPY ${path}`)
    const whitelisted = ignore.split('\n').some((line) => line.trim() === `!${path}` || (path.startsWith('src/bench/engine') && line.trim() === '!src/bench/engine.*'))
    assert.ok(whitelisted, `.dockerignore does not whitelist ${path}`)
  }
})
