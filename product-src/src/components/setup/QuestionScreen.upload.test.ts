import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuestionScreen } from './QuestionScreen'
import { ActionButton, ActionFeedback } from '@/components/ActionButton'
import { SkeletonRegion } from '@/components/Skeleton'
import { uploadOnboardingFiles } from '@/lib/onboardingFlow'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState(initial: unknown) {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? initial() : initial
    return [hooks.slots[slot], (next: unknown) => { hooks.slots[slot] = typeof next === 'function' ? next(hooks.slots[slot]) : next }]
  },
  useRef(initial: unknown) { const slot = hooks.cursor++; if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }; return hooks.slots[slot] },
  useEffect: vi.fn(),
}))
vi.mock('@/lib/onboardingFlow', () => ({ uploadOnboardingFiles: vi.fn() }))
vi.mock('@/lib/useDictation', () => ({ useDictation: () => ({ active: false, finishing: false }) }))
type Props = { children?: ReactNode; 'aria-label'?: string; action?: Parameters<typeof ActionButton>[0]['action']; onChange?: (event: { target: { files: File[]; value: string } }) => void; onSubmit?: (event: { preventDefault(): void }) => void }
const elements = (node: ReactNode): ReactElement<Props>[] => Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
const answer = vi.fn()
const render = () => { hooks.cursor = 0; return QuestionScreen({ question: 'Add your time entries', card: { kind: 'question', input: 'files', topics: ['workerHours'] }, initialAnswer: 'Existing answer', canBack: true, onBack() {}, onAnswer: answer }) }
beforeEach(() => { hooks.cursor = 0; hooks.slots = []; vi.clearAllMocks(); vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }) })
afterEach(() => vi.unstubAllGlobals())

it('retains the upload control, reserves the result immediately, and retries the same files without exposing their names', async () => {
  let fail!: (cause: Error) => void
  vi.mocked(uploadOnboardingFiles).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
  const file = new File(['worker,hours\nJo,8'], 'private-timesheet.csv')
  elements(render()).find(node => node.props['aria-label'] === 'Choose files')!.props.onChange!({ target: { files: [file], value: file.name } })
  const pending = render()
  expect(elements(pending).find(node => node.type === ActionButton)!.props.action).toMatchObject({ status: 'pending', pending: true })
  expect(elements(pending).some(node => node.type === SkeletonRegion)).toBe(true)
  fail(new Error('Connection interrupted'))
  await vi.waitFor(() => expect(elements(render()).find(node => node.type === ActionFeedback)!.props.action?.error).toBe('Connection interrupted'))
  vi.mocked(uploadOnboardingFiles).mockResolvedValueOnce([file.name])
  await elements(render()).find(node => node.type === ActionFeedback)!.props.action!.retry()
  expect(uploadOnboardingFiles).toHaveBeenLastCalledWith([file], undefined, 1)
  const saved = render()
  expect(elements(saved).find(node => node.type === ActionButton)!.props.action?.status).toBe('success')
  const html = renderToStaticMarkup(saved)
  expect(html).toContain('Attached source')
  expect(html).not.toContain(file.name)
  elements(saved).find(node => node.type === 'form')!.props.onSubmit!({ preventDefault() {} })
  expect(answer).toHaveBeenCalledWith('1 source attached\nExisting answer')
})
