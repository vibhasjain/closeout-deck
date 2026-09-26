import { Children, isValidElement, type EffectCallback, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Intake } from './Intake'
import { ConnectMethod } from './ConnectMethod'
import { FirstCloseoutChoice } from './chat/FirstCloseoutChoice'
import { FactQuestion } from './chat/FactQuestion'
import { SOURCES } from '@/bench/vendors'
import { DEFAULTS, getOnboarding, updateOnboarding } from '@/lib/onboarding'
import { buildCycles, type DeskCycle } from '@/lib/desk'
import { connectSource, removeFile, uploadFile, type FileRecord } from '@/lib/data'
import { RemoveFile } from './RemoveFile'
import { INGEST_RESULT_EVENT, postToChat } from '@/lib/chatBus'
import type { Intake as IntakeData } from '@/lib/intake'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
const router = vi.hoisted(() => ({ navigate: vi.fn() }))
const overlay = vi.hoisted(() => ({ close: vi.fn(), toast: vi.fn() }))
const data = vi.hoisted(() => ({ files: [] as unknown[] }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: <T>(initial: T | (() => T)) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [hooks.slots[slot], (next: T | ((old: T) => T)) => { hooks.slots[slot] = typeof next === 'function' ? (next as (old: T) => T)(hooks.slots[slot] as T) : next }]
  },
  useRef: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useEffect: (effect: EffectCallback) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = effect()
  },
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => router.navigate }))
vi.mock('@/lib/onboarding', async (original) => {
  const actual = await original<typeof import('@/lib/onboarding')>()
  return { ...actual, useOnboarding: () => [actual.getOnboarding(), actual.updateOnboarding] }
})
vi.mock('@/lib/useCurrentEmail', () => ({ useCurrentEmail: () => 'payroll@example.com' }))
vi.mock('@/components/shell/Overlay', () => ({ useOverlay: () => overlay }))
vi.mock('@/lib/data', () => ({ uploadFile: vi.fn(), seedSample: vi.fn(), connectSource: vi.fn(), invalidate: vi.fn(), removeFile: vi.fn(), useData: () => ({ files: data.files }) }))
vi.mock('@/lib/chatBus', () => ({ postToChat: vi.fn(), INGEST_RESULT_EVENT: 'closeout:ingest-result' }))

type Props = { children?: ReactNode; 'aria-label'?: string; onClick?: () => void; onChange?: (event: { target: { files: FileList; value: string } }) => void }
const elements = (tree: ReactNode): ReactElement<Props>[] => Children.toArray(tree).flatMap((child) => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
const findText = (tree: ReactNode, text: string) => elements(tree).find(({ props }) => Children.toArray(props.children).filter((child) => typeof child === 'string').join('') === text)!
const source = { ...SOURCES[0], set: 2 as const }
let cycle: DeskCycle
const intake: IntakeData = { expected: 1, received: 0, open: 1, closed: [], clients: [{ name: 'Pacific Cold Storage', expected: 1, received: 0, open: 1,
  sources: [{ source, expected: 1, received: 0, pending: 1, missing: [], late: false, lastReceived: new Date(2026, 8, 20) }] }] }
const renderIntake = () => { hooks.cursor = 0; return Intake({ cycle, intake }) }
const choiceAnswer = vi.fn()
const renderChoice = () => FirstCloseoutChoice({ card: { kind: 'question', input: 'choice', topics: ['location'], set: 3, choice: { yours: 'Use our location records', sample: 'Use sample location records' } }, onAnswer: choiceAnswer })
beforeEach(() => {
  hooks.slots = []; vi.resetAllMocks(); data.files = []
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  vi.stubGlobal('window', new EventTarget())
  updateOnboarding(structuredClone(DEFAULTS))
  cycle ??= buildCycles(DEFAULTS, new Date(2026, 8, 25))[1]
})
afterEach(() => vi.unstubAllGlobals())

describe('real intake actions', () => {
  it('uploads from an agent files card using the requested source set and follows up in chat', async () => {
    vi.mocked(uploadFile).mockResolvedValue({ file: { id: 'f_card', name: 'approved.csv', status: 'needs_mapping', sample: false } } as Awaited<ReturnType<typeof uploadFile>>)
    const tree = FactQuestion({ card: { kind: 'question', input: 'files', topics: ['clientHours'], placeholder: 'Upload client-approved time entries' }, onAnswer: vi.fn() })
    const file = new File(['Name,Date,Hours\nJo,2026-09-18,8'], 'approved.csv')
    elements(tree).find(({ props }) => props['aria-label'] === 'Upload time entries')!.props.onChange!({ target: { files: [file] as unknown as FileList, value: '' } })
    await vi.waitFor(() => expect(postToChat).toHaveBeenCalled())
    expect(uploadFile).toHaveBeenCalledWith(file, { set: 2, system: 'Spreadsheet' })
    expect(postToChat).toHaveBeenCalledWith({ text: 'Uploaded approved.csv', contextChip: 'approved.csv', mode: 'ingest', context: { fileIds: ['f_card'] } })
  })
  it('uploads the selected source/set and starts an ingest turn with a context chip and real row counts', async () => {
    vi.mocked(uploadFile).mockResolvedValue({ file: { id: 'f_csv', name: 'ukg_export.csv', status: 'needs_mapping', rows: 3, entries: 0, sample: false,
      rowCount: 3, entryCount: 0, unparsed: [], gaps: [{ ask: 'Which state is this site in?' }], cycles: [] } } as unknown as Awaited<ReturnType<typeof uploadFile>>)
    const buttons = elements(renderIntake()).filter(({ props }) => props.children === 'Upload')
    buttons.at(-1)!.props.onClick!()
    const file = new File(['Person,Start\nJo,8:00 AM'], 'ukg_export.csv', { type: 'text/csv' })
    elements(renderIntake()).find(({ props }) => props['aria-label'] === 'Upload a time export')!.props.onChange!({ target: { files: [file] as unknown as FileList, value: '' } })
    await vi.waitFor(() => expect(postToChat).toHaveBeenCalled())
    expect(uploadFile).toHaveBeenCalledWith(file, { set: 2, system: 'UKG', site: 'Pacific Cold Storage' })
    expect(postToChat).toHaveBeenCalledWith({ text: 'Uploaded ukg_export.csv for Pacific Cold Storage', mode: 'ingest', context: { fileIds: ['f_csv'] }, contextChip: 'Pacific Cold Storage · ukg_export.csv' })
    const text = JSON.stringify(renderIntake())
    expect(text).toContain('3')
    expect(text).toContain('Closeout Agent is reading the layout')
    expect(text).toContain('Which state is this site in?')
    expect(getOnboarding().uploads).toEqual({})
    window.dispatchEvent(new CustomEvent(INGEST_RESULT_EVENT, { detail: { fileId: 'f_csv', status: 'normalized', rows: 3, entries: 3, unparsed: 0, gaps: [] } }))
    const normalized = JSON.stringify(renderIntake())
    expect(normalized).toContain('Mapped by Closeout Agent')
    expect(normalized).not.toContain('Which state is this site in?')
  })

  it('asks for the absent set on a server cycle without inventing a schedule or no-show', async () => {
    const serverCycle = { ...cycle, server: true, sample: false, sites: [{ name: 'Pacific Cold Storage', key: 'pacific' }], gaps: [{ id: 'missing2', kind: 'set_missing', key: 'pacific|2', ask: 'Can you send Pacific Cold Storage’s client-approved hours?' }] } as DeskCycle
    const realIntake = { ...intake, clients: [{ ...intake.clients[0], sources: [{ ...intake.clients[0].sources[0], pending: 0, source: { ...source, set: 1 as const }, missing: [{ id: 'gap', worker: 'Jo', client: 'Pacific Cold Storage', day: 0, source: source.id }] }] }] }
    hooks.cursor = 0
    const tree = Intake({ cycle: serverCycle, intake: realIntake })
    const text = JSON.stringify(tree)
    expect(findText(tree, 'Upload client-approved')).toBeDefined()
    expect(text).not.toContain('No Time Entry')
    expect(text).not.toContain('Scheduled, no punches')
    expect(text).not.toContain('Mark No-Show')
    findText(tree, 'Upload client-approved').props.onClick!()
    hooks.cursor = 0
    const next = Intake({ cycle: serverCycle, intake: realIntake })
    vi.mocked(uploadFile).mockRejectedValue(new Error('Stopped at request'))
    const file = new File(['Person,Hours\nJo,8'], 'approved.csv')
    elements(next).find(({ props }) => props['aria-label'] === 'Upload a time export')!.props.onChange!({ target: { files: [file] as unknown as FileList, value: '' } })
    await vi.waitFor(() => expect(uploadFile).toHaveBeenCalledWith(file, { set: 2, system: 'Spreadsheet', site: 'Pacific Cold Storage' }))
  })

  it('renders the agent choice labels and returns the chosen answer to its conversation', () => {
    choiceAnswer.mockClear()
    const tree = renderChoice()
    findText(tree, 'Use sample location records').props.onClick!()
    expect(choiceAnswer).toHaveBeenCalledWith('Set 3: Use sample location records')
    findText(tree, 'Use our location records').props.onClick!()
    expect(choiceAnswer).toHaveBeenLastCalledWith('Set 3: Use our location records')
    expect(JSON.stringify(tree)).toContain('"data-timesheet-set":3')
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('loads a shared-sheet simulation and tags the saved connection Sample', async () => {
    vi.mocked(connectSource).mockResolvedValue({ files: [], cycles: ['2026-09-20'] })
    hooks.cursor = 0
    const tree = ConnectMethod({ vendor: source })
    const option = elements(tree).find(({ props }) => Array.isArray(props.children) && props.children.some((child) => isValidElement<Props>(child) && child.props.children === 'Shared sheet'))!
    option.props.onClick!()
    await vi.waitFor(() => expect(getOnboarding().connections['source:ukg-ready']).toMatchObject({ status: 'connected', method: 'sheet', sample: true }))
    expect(connectSource).toHaveBeenCalledWith({ set: 2, system: 'UKG', site: 'Pacific Cold Storage' })
    expect(overlay.toast).toHaveBeenCalledWith('UKG connected · Sample')
  })
})

describe('removing an uploaded file', () => {
  const stored = (id: string, patch: Partial<FileRecord> = {}): FileRecord => ({ id, sourceId: 'src_1', mappingId: 'map_1', name: `${id}.csv`, mime: 'text/csv', bytes: 10, sha256: id, storagePath: `a/files/${id}/${id}.csv`,
    status: 'normalized', fingerprint: 'fp', setHint: 1, periodEnd: null, firstDate: cycle.id, lastDate: cycle.id, rowCount: 3, entryCount: 3, unparsed: [], sample: false, receivedAt: '2026-09-21T15:00:00.000Z', normalizedAt: '2026-09-21T15:00:00.000Z', ...patch })
  const removers = (tree: ReactNode) => elements(tree).filter((element) => element.type === RemoveFile).map((element) => (element.props as unknown as Parameters<typeof RemoveFile>[0]))
  const renderRemove = (props: Parameters<typeof RemoveFile>[0]) => { hooks.cursor = 0; return RemoveFile(props) }

  it('lists this pay run\'s own uploads and ones that never became time entries, each with Remove; sample files and other weeks get none', async () => {
    data.files = [stored('f_mine'), stored('f_old', { firstDate: '2025-01-05', lastDate: '2025-01-05' }), stored('f_failed', { status: 'needs_mapping', firstDate: null, lastDate: null, entryCount: null }), stored('f_sample', { sample: true })]
    const tree = renderIntake()
    const text = JSON.stringify(tree)
    expect(removers(tree).map((props) => props.file.id)).toEqual(['f_mine', 'f_failed'])
    expect(text).toContain('f_mine.csv'); expect(text).toContain('3 time entries'); expect(text).toContain('Rows awaiting mapping')
    expect(text).not.toContain('f_old.csv'); expect(text).not.toContain('f_sample.csv')

    // A file uploaded here is listed once, in its upload result, and Remove takes that row away.
    vi.mocked(uploadFile).mockResolvedValue({ file: { ...stored('f_new', { status: 'needs_mapping' }), rows: 3, entries: 0, gaps: [], cycles: [] } } as unknown as Awaited<ReturnType<typeof uploadFile>>)
    elements(renderIntake()).filter(({ props }) => props.children === 'Upload').at(-1)!.props.onClick!()
    elements(renderIntake()).find(({ props }) => props['aria-label'] === 'Upload a time export')!.props.onChange!({ target: { files: [new File(['x'], 'f_new.csv')] as unknown as FileList, value: '' } })
    await vi.waitFor(() => expect(postToChat).toHaveBeenCalled())
    data.files = [stored('f_new', { status: 'needs_mapping' }), ...data.files]
    const uploaded = removers(renderIntake())
    expect(uploaded.map((props) => props.file.id)).toEqual(['f_new', 'f_mine', 'f_failed'])
    uploaded[0].onRemoved!()
    data.files = data.files.filter((file) => (file as FileRecord).id !== 'f_new')
    expect(JSON.stringify(renderIntake())).not.toContain('f_new.csv')
  })

  it('asks inline before it deletes, never offers it for a sample file, and hands the removal to the desk refresh', async () => {
    const confirm = vi.fn(); vi.stubGlobal('confirm', confirm)
    expect(renderRemove({ file: { id: 'f_sample', name: 'sample.csv', sample: true } })).toBeNull()
    const onRemoved = vi.fn(), file = { id: 'f_wrong', name: 'wrong week.csv', sample: false }
    const button = elements(renderRemove({ file, onRemoved }))[0]
    expect(button.props['aria-label']).toBe('Remove wrong week.csv')
    expect(JSON.stringify(button)).not.toContain('primary')
    button.props.onClick!()
    let prompt = renderRemove({ file, onRemoved })
    expect(JSON.stringify(prompt)).toContain('Remove wrong week.csv? Its time entries leave every pay run.')
    findText(prompt, 'Cancel').props.onClick!()
    expect(findText(renderRemove({ file, onRemoved }), 'Remove')).toBeDefined()
    expect(removeFile).not.toHaveBeenCalled()

    vi.mocked(removeFile).mockRejectedValueOnce(new Error('internal_error'))
    elements(renderRemove({ file, onRemoved }))[0].props.onClick!()
    findText(renderRemove({ file, onRemoved }), 'Remove').props.onClick!()
    await vi.waitFor(() => expect(JSON.stringify(renderRemove({ file, onRemoved }))).toContain('The file could not be removed. Try again.'))
    expect(onRemoved).not.toHaveBeenCalled()

    vi.mocked(removeFile).mockResolvedValueOnce({ ok: true, cycles: ['2026-09-20'] })
    prompt = renderRemove({ file, onRemoved })
    findText(prompt, 'Remove').props.onClick!()
    await vi.waitFor(() => expect(onRemoved).toHaveBeenCalledOnce())
    expect(removeFile).toHaveBeenLastCalledWith('f_wrong')
    // If the desk refresh failed and the row lingers, it never re-asks about a file that is already gone.
    expect(JSON.stringify(renderRemove({ file, onRemoved }))).not.toContain('Its time entries leave every pay run.')
    expect(confirm).not.toHaveBeenCalled()
  })
})
