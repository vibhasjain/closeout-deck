import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('the only-voice client contract', () => {
  it('contains no browser speech recognizer or alternate realtime voice model', () => {
    const forbidden = new RegExp(['Speech' + 'Recognition', 'gpt-' + 'realtime', 'webkit' + 'Speech'].join('|'))
    const sources = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = join(directory, entry.name)
      return entry.isDirectory() ? sources(file) : /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [file] : []
    })
    const offending = sources(join(import.meta.dirname, '..')).filter(file => forbidden.test(readFileSync(file, 'utf8')))
    expect(offending).toEqual([])
  })
})
