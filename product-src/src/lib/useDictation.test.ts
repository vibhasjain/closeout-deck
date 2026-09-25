import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startDictation, type DictationOptions } from './dictate'
import { useDictation } from './useDictation'

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], cleanup: [] as (() => void)[] }))
vi.mock('react', () => ({
  useState(initial: unknown) {
    const index = hooks.index++
    if (!(index in hooks.slots)) hooks.slots[index] = initial
    return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = next }]
  },
  useRef(initial: unknown) {
    const index = hooks.index++
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }
    return hooks.slots[index]
  },
  useEffect(effect: () => (() => void)) {
    const index = hooks.index++
    if (!(index in hooks.slots)) { hooks.slots[index] = true; hooks.cleanup.push(effect()) }
  },
}))
vi.mock('./dictate', () => ({ startDictation: vi.fn() }))

let options: DictationOptions
let draft: string
let stop: ReturnType<typeof vi.fn>
const onDraft = vi.fn((text: string) => { draft = text })
function render() {
  hooks.index = 0
  // eslint-disable-next-line react-hooks/rules-of-hooks -- The test dispatcher above supplies and preserves the hook slots.
  return useDictation(draft, onDraft)
}
beforeEach(() => {
  draft = 'Existing draft  '
  stop = vi.fn(async () => '')
  vi.mocked(startDictation).mockImplementation(value => { options = value; return { stop, dispose: vi.fn() } })
})
afterEach(() => { hooks.cleanup.forEach(cleanup => cleanup()); hooks.slots = []; hooks.cleanup = []; vi.clearAllMocks() })

it('exposes connection, listening and finishing status from the dictation session', async () => {
  render().start()
  expect(render()).toMatchObject({ active: true, finishing: false, state: 'connecting', status: 'Connecting…' })
  options.onState?.('listening')
  expect(render()).toMatchObject({ active: true, status: 'Listening…' })
  let complete!: (text: string) => void
  stop.mockImplementation(() => {
    options.onState?.('finishing')
    return new Promise<string>(resolve => { complete = resolve })
  })
  const finished = render().stop()
  expect(render()).toMatchObject({ active: true, finishing: true, status: 'Finishing…' })
  complete('more words')
  expect(await finished).toBe('Existing draft more words')
  expect(render()).toMatchObject({ active: false, finishing: false, status: '' })
})

it('preserves the exact original draft when stopping before a transcript delta', async () => {
  render().start()
  expect(await render().stop()).toBe('Existing draft  ')
  expect(draft).toBe('Existing draft  ')
  expect(render().active).toBe(false)
})

it('keeps partial text visible after an error and leaves Retry available', () => {
  render().start()
  options.onTranscript('weekly', false)
  options.onError('Dictation is busy right now. Try again in a moment.')
  expect(draft).toBe('Existing draft weekly')
  expect(render()).toMatchObject({ active: false, finishing: false, state: 'error', error: 'Dictation is busy right now. Try again in a moment.' })
  render().start()
  expect(startDictation).toHaveBeenCalledTimes(2)
  expect(render()).toMatchObject({ active: true, error: '' })
})

it('ignores callbacks from a dismissed session after the user starts a new dictation', () => {
  render().start()
  const old = options
  render().dismiss(); render().start()
  old.onTranscript('obsolete', true); old.onError('obsolete error'); old.onState?.('ended')
  expect(draft).toBe('Existing draft  ')
  expect(render()).toMatchObject({ active: true, state: 'connecting', error: '' })
})

it('prevents duplicate sessions before a rerender and handles automatic completion', () => {
  const dictation = render()
  dictation.start(); dictation.start()
  expect(startDictation).toHaveBeenCalledOnce()
  options.onTranscript('weekly Payroll', true); options.onState?.('ended')
  expect(draft).toBe('Existing draft weekly Payroll')
  expect(render()).toMatchObject({ active: false, status: '' })
})
