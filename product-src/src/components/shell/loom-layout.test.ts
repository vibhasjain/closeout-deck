import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatRow } from '@/components/StatRow'
import { VendorTile } from '@/components/SourcesTable'
import { SOURCES } from '@/bench/vendors'

const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('Loom layout contracts', () => {
  it('keeps five KPIs and their placeholders on one row, including narrow payroll containers', () => {
    const sheet = css('../../pages/reconcile.css')
    const placeholders = css('../skeleton.css')
    expect(sheet).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))')
    expect(sheet).toContain('grid-template-columns: repeat(5, minmax(104px, 1fr))')
    expect(sheet).not.toMatch(/\.result-summary[^}]*repeat\([23],/)
    expect(placeholders).not.toMatch(/\.skeleton-kpis[^}]*repeat\([23],/)
    const labels = ['Payments', 'Discrepancies', 'Resolved', 'Review', 'Disputes']
    const html = renderToStaticMarkup(createElement(StatRow, { stats: labels.map(label => ({ label, value: '6,283' })) }))
    expect(html.match(/class="stat"/g)).toHaveLength(5)
    labels.forEach(label => expect(html).toContain(label))
  })

  it('uses the same fixed header height and border for navigation, agent and every PageTitle', () => {
    expect(css('../../index.css')).toContain('--shell-header-height: 56px')
    for (const [file, selector] of [
      ['./shell.css', '.sidebar-brand-row'],
      ['./page-title.css', '.page-title-row'],
      ['../chat/journey-chat.css', '.chat .chat-header'],
    ]) {
      const block = css(file).slice(css(file).indexOf(`${selector} {`)).split('}')[0]
      expect(block).toContain('height: var(--shell-header-height)')
      expect(block).toContain('border-bottom: 1px solid hsl(var(--border))')
    }
    for (const page of ['Payroll', 'Rules', 'Settings', 'Profile']) {
      expect(css(`../../pages/${page}.tsx`)).toContain('<PageTitle')
    }
    const profile = css('../../pages/profile.css').match(/\.payroll-profile-page \{([^}]*)\}/)![1]
    expect(profile).not.toContain('padding:')
    expect(css('../../pages/shift-page.css')).toContain('.shift-modal .shift-page-column:first-child > .page-title-row { height: auto; flex-basis: auto; }')
  })

  it('animates desktop columns and labels, slides both drawer directions, and disables motion when requested', () => {
    const sheet = css('./shell.css')
    expect(sheet).toContain('transition: grid-template-columns 200ms ease-out')
    expect(sheet).toContain('transition: opacity 140ms ease-out, max-width 200ms ease-out')
    expect(sheet).toContain('transition: transform 200ms ease-out, visibility 0s linear 200ms')
    expect(sheet).toContain('transition: opacity 200ms ease-out, visibility 0s linear 200ms')
    expect(sheet).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none !important/)
    expect(css('./TopNav.tsx')).toContain('{!wide && <div className="sidebar-scrim"')
  })

  it('keeps HyperTrack branding in the shell header and rule pills monochrome', () => {
    const location = SOURCES.find(source => source.id === 'hypertrack')!
    const html = renderToStaticMarkup(createElement(VendorTile, { vendor: location }))
    expect(html).not.toContain('<img')
    expect(html).toContain('lucide-map-pin')
    const bucket = css('../../bench.css').match(/\.bucket-tag \{([^}]*)\}/)![1]
    expect(bucket).not.toContain('--hue')
  })

  it('sizes the square HyperTrack mark by height on every width (a wordmark width made it 126px tall on phones)', () => {
    const shell = css('./shell.css')
    expect(shell).toMatch(/\.brand img \{[^}]*height: 26px; width: auto;/)
    expect(shell).not.toMatch(/\.brand img \{[^}]*width: \d+px/)
  })
})
