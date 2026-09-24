import { describe, it, expect } from 'vitest'
import { parseActions } from './chat'
describe('parseActions', () => {
  it('extracts one action and strips the block', () => {
    const r = parseActions('Done, weekly it is.\n```action\n{"type":"set_calendar","patch":{"frequency":"Weekly"}}\n```')
    expect(r.text).toBe('Done, weekly it is.'); expect(r.actions).toEqual([{ type: 'set_calendar', patch: { frequency: 'Weekly' } }])
  })
  it('ignores malformed blocks', () => { expect(parseActions('x\n```action\n{nope\n```').actions).toEqual([]) })
  it('extracts two actions and strips both blocks', () => {
    const r = parseActions('Done.\n```action\n{"type":"set_calendar","patch":{"frequency":"Weekly"}}\n```\n```action\n{"type":"go","to":"/timesheets"}\n```')
    expect(r.text).toBe('Done.')
    expect(r.text).not.toContain('```action')
    expect(r.actions).toEqual([
      { type: 'set_calendar', patch: { frequency: 'Weekly' } },
      { type: 'go', to: '/timesheets' },
    ])
  })
})
