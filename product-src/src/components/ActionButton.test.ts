import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ActionButton, ActionFeedback } from './ActionButton'
import type { PendingAction } from '@/lib/usePendingAction'

const action = (status: PendingAction['status']): PendingAction => ({ status, key: 'approve', pending: status === 'pending', error: status === 'error' ? 'Could not save' : null,
  run: async () => true, retry: async () => true, reset() {} })
const markup = (status: PendingAction['status']) => renderToStaticMarkup(createElement(ActionButton, { action: action(status), pendingLabel: 'Approving…', successLabel: 'Approved', children: 'Approve 8' }))

describe('stable action control', () => {
  it('reserves every label from idle through pending and success', () => {
    for (const status of ['idle', 'pending', 'success'] as const) {
      const html = markup(status)
      expect(html.match(/class="action-button-label"/g)).toHaveLength(3)
      expect(html).toContain(`data-action-state="${status}"`)
      expect(html).toContain('Approve 8')
      expect(html).toContain('Approving…')
      expect(html).toContain('Approved')
    }
    expect(markup('pending')).toContain('aria-busy="true"')
    expect(markup('pending')).toContain('class="spinner"')
    expect(markup('success')).toContain('disabled=""')
  })
  it('returns the enabled control with an inline error and Retry', () => {
    expect(markup('error')).not.toContain('disabled=""')
    const html = renderToStaticMarkup(createElement(ActionFeedback, { action: action('error') }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('Could not save')
    expect(html).toContain('Retry')
  })
})
