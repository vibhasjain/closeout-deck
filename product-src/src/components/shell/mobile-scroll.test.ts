import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: match[1].trim(),
  declarations: Object.fromEntries(match[2].split(';').map((declaration) => {
    const colon = declaration.indexOf(':')
    return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()]
  }).filter(([property]) => property)),
}))

describe('mobile scroll clearance', () => {
  it('keeps the shell at viewport height and never reserves orb space outside its scrollports', () => {
    expect(rules.find(({ selector }) => selector === '.app')?.declarations.height).toBe('100dvh')
    for (const { declarations } of rules.filter(({ selector }) => /(?:^|\s)\.main$/.test(selector))) {
      // This catches the former 80px + safe-area padding on .main, which shortened
      // every scrolling pane and left an unreachable strip below its last row.
      expect(declarations['padding-bottom']).toBeUndefined()
      expect(declarations['padding-block']).toBeUndefined()
      expect(declarations['padding']).toBeUndefined()
      expect(declarations['margin-bottom']).toBeUndefined()
    }
  })

  it.each(['.payroll-summary', '.intake', '.sheet-wrap', '.settings-columns', '.payroll-profile-page-content', '.rules-page:has(> .memory-panel)'])(
    'places orb clearance inside the %s content scrollport', (scrollport) => {
      const rule = rules.find(({ selector, declarations }) => selector.includes('.main ')
        && selector.includes(scrollport) && declarations['padding-bottom'])
      expect(rule?.declarations['padding-bottom']).toBe('var(--mobile-orb-clearance)')
      expect(rule?.declarations['scroll-padding-bottom']).toBe('var(--mobile-orb-clearance)')
      // Settings owns one outer mobile scroller. Padding its non-scrolling child
      // columns instead would create a gap between the connector and calendar panes.
      expect(rule?.selector).not.toContain('.detail-body')
    },
  )

  it('pads the shared Rules scroller once when memory makes its table non-scrolling', () => {
    const memory = readFileSync(new URL('../memory/memory.css', import.meta.url), 'utf8')
    expect(memory).toMatch(/\.rules-page:has\(> \.memory-panel\)\s*\{\s*overflow-y:\s*auto;/)
    const table = rules.find(({ selector }) => selector.endsWith('.rules-page:has(> .memory-panel) > .rules-table-wrap'))
    expect(table?.declarations['padding-bottom']).toBe('0')
  })

  it('accounts for the header safe area once and keeps the orb available across drawer widths', () => {
    const app = rules.find(({ selector }) => selector === '.app')!.declarations
    expect(app['--mobile-header-height']).toBe('calc(48px + env(safe-area-inset-top))')
    expect(app['grid-template-rows']).toBe('var(--mobile-header-height) minmax(0, 1fr)')
    const mobile = css.slice(css.indexOf('@media (max-width: 1023.98px)'), css.indexOf('@media (min-width: 1024px)', css.indexOf('@media (max-width: 1023.98px)')))
    expect(mobile).toMatch(/\.agent-fab\s*\{[^}]*position:\s*fixed;[^}]*display:\s*grid;/)
    expect(app['--mobile-orb-clearance']).toBe('calc(64px + env(safe-area-inset-bottom))')
  })
})
