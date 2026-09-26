import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
const root = resolve(import.meta.dirname, '..')
function sources(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sources(resolve(dir, entry.name)) : /\.tsx$/.test(entry.name) ? [resolve(dir, entry.name)] : []) }
describe('no loading presentation contract', () => {
  it('keeps spinners confined to shared pending-action controls', () => {
    const offenders = sources(root).filter(file => !file.endsWith('/ActionButton.tsx')).filter(file => /Spinner|Loader2|animate-spin/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
  it('renders the static shell around the hydration boundary', () => {
    const layout = readFileSync(resolve(root, 'components/OnboardingLayout.tsx'), 'utf8')
    expect(layout).toContain('<AppShell><OnboardingSyncBoundary>')
    expect(layout).toContain('if (ready && !forwarded')
  })
  it('uses a fast sweep and content fade with static reduced motion', () => {
    const css = readFileSync(resolve(root, 'components/skeleton.css'), 'utf8')
    expect(css).toContain('skeleton-shimmer .9s linear')
    expect(css).toContain('content-arrive 100ms')
    expect(css).toContain('.skeleton::after { animation: none; display: none; }')
  })
})
