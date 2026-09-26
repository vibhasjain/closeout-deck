import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PayDelta } from './PayDelta'

describe('shared money block', () => {
  it('adds the time-entry count and signed change for the left-aligned card', () => {
    const html = renderToStaticMarkup(createElement(PayDelta, { current: 2400, resolved: 3939.33, timeEntries: 8, size: 'sm', align: 'start' }))
    expect(html).toContain('pay-amounts-start')
    expect(html).toContain('>8</span><span class="pay-amounts-caption">Time entries</span>')
    expect(html).toContain('>$2,400.00</span><span class="pay-amounts-caption">Current</span>')
    expect(html).toContain('>$3,939.33</span><span class="pay-amounts-caption">Resolved')
    expect(html).toContain('class="pay-amounts-change">+$1,539.33</span>')
  })

  it('keeps the pane pair end-aligned by default without extra card metadata', () => {
    const html = renderToStaticMarkup(createElement(PayDelta, { current: 2400, resolved: 3939.33, size: 'sm' }))
    expect(html).toContain('pay-amounts-end')
    expect(html).toContain('>Current</span>')
    expect(html).toContain('>Resolved</span>')
    expect(html).not.toContain('pay-amounts-entries')
    expect(html).not.toContain('pay-amounts-change')
  })

  it.each([
    [150, 120, '−$30.00'],
    [120, 120, '$0.00'],
    [120, 119.999999999, '$0.00'],
  ])('formats the card change from %s to %s as %s', (current, resolved, change) => {
    const html = renderToStaticMarkup(createElement(PayDelta, { current, resolved, align: 'start' }))
    expect(html).toContain(`class="pay-amounts-change">${change}</span>`)
    expect(html).not.toContain('Time entries')
  })
})
