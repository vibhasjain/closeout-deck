import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TopNav } from './TopNav'
import { StartOver } from '@/components/StartOver'
import { OnboardingAccount } from '@/components/setup/OnboardingAccount'
import { startOver } from '@/lib/startOver'
import { signOut } from '@/lib/viewerSession'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
const account = vi.hoisted(() => ({ email: 'morgan@example.com', name: 'Morgan Lee' }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T,>(initial: T | (() => T)) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [hooks.slots[index], (value: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof value === 'function' ? (value as (previous: T) => T)(hooks.slots[index] as T) : value
    }]
  },
  useRef: <T,>(initial: T) => ({ current: initial }),
  useCallback: <T,>(callback: T) => callback,
  useId: () => 'sidebar-menu',
  useEffect: () => {},
}))
vi.mock('react-router-dom', () => ({
  NavLink: () => null,
  useLocation: () => ({ pathname: '/payroll' }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))
vi.mock('@/lib/onboarding', () => ({ useOnboarding: () => [{ sidebar: 'full', forwarded: true }, vi.fn()] }))
vi.mock('@/lib/cycles', () => ({ recentCycles: () => [{ id: 'current' }, { id: 'pending' }] }))
vi.mock('@/lib/intake', () => ({ intakeHref: () => '/payroll?step=intake' }))
vi.mock('@/lib/viewerSession', () => ({ signOut: vi.fn(), viewerSession: () => account }))
vi.mock('@/lib/useCurrentEmail', () => ({ useCurrentEmail: () => account.email }))
vi.mock('./Overlay', () => ({ useOverlay: () => ({ toast: vi.fn() }) }))
vi.mock('./PayRuns', () => ({ PayRuns: () => null }))
vi.mock('./GettingStarted', () => ({ GettingStarted: () => null }))
// The wipe itself is covered in StartOver.test.ts; here it only proves the confirm gates the call.
vi.mock('@/lib/startOver', async (original) => ({ ...await original<typeof import('@/lib/startOver')>(), startOver: vi.fn(async () => 'busy') }))

type Props = {
  children?: ReactNode
  className?: string
  role?: string
  alt?: string
  src?: string
  disabled?: boolean
  inert?: boolean
  'aria-label'?: string
  'aria-expanded'?: boolean
  id?: string
  type?: string
  popover?: string
  popoverTarget?: string
  onClick?(): void
  onClose?(): void
  onToggle?(event: { newState: string }): void
  onSubmit?(event: { preventDefault(): void }): Promise<void>
  onChange?(event: { target: { value: string } }): void
}
const elements = (node: ReactNode): ReactElement<Props>[] => Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
const text = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<Props>(child) ? text(child.props.children) : String(child)).join('')
const button = (node: ReactNode, name: string) => elements(node).find(({ type, props }) => type === 'button' && (props['aria-label'] === name || text(props.children) === name))!
const render = (width: number) => { hooks.cursor = 0; return TopNav({ wide: width >= 1024 }) }
const renderCorner = () => { hooks.cursor = 0; return OnboardingAccount() }
const find = (node: ReactNode, match: (element: ReactElement<Props>) => boolean) => elements(node).find(match)

beforeEach(() => { hooks.slots = []; vi.clearAllMocks() })

describe('HyperTrack navigation and unified sign out', () => {
  it('keeps the 390px top bar to a left burger and right full HyperTrack logo', () => {
    const tree = render(390)
    const topbar = elements(tree).find(({ props }) => props.className === 'mobile-topbar')!
    const children = Children.toArray(topbar.props.children) as ReactElement<Props>[]
    expect(children).toHaveLength(2)
    expect(children[0].props['aria-label']).toBe('Open sidebar')
    const image = elements(children[1]).find(({ type }) => type === 'img')!
    expect(image.props).toMatchObject({ alt: 'HyperTrack' })
    expect(image.props.src).toMatch(/logo-small\.svg$/) // the mark only: no HyperTrack name, no Closeout
    expect(text(topbar)).toBe('')
    expect(text(tree)).not.toContain('Closeout')
  })

  it('makes Log out visible with name and email immediately inside the 390px drawer', async () => {
    button(render(390), 'Open sidebar').props.onClick!()
    const tree = render(390)
    const drawer = elements(tree).find(({ props }) => props.role === 'dialog')!
    expect(drawer.props.inert).toBe(false)
    const identity = elements(drawer).find(({ props }) => props.className === 'sidebar-account-identity')!
    expect(text(identity)).toContain('Morgan Lee')
    expect(text(identity)).toContain('morgan@example.com')
    expect(button(drawer, 'Account menu')).toBeUndefined()
    const logout = button(drawer, 'Log out')
    expect(logout.props.disabled).toBe(false)
    logout.props.onClick!()
    await Promise.resolve()
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('opens Log out from the 1440px account row and calls the same unified signOut', async () => {
    const closed = render(1440)
    expect(button(closed, 'Log out')).toBeUndefined()
    button(closed, 'Account menu').props.onClick!()
    const opened = render(1440)
    expect(button(opened, 'Account menu').props['aria-expanded']).toBe(true)
    const menu = elements(opened).find(({ props }) => props.role === 'menu')!
    const logout = button(menu, 'Log out')
    expect(logout.props.role).toBe('menuitem')
    expect(logout.props['aria-label']).toBe('Log out')
    logout.props.onClick!()
    await Promise.resolve()
    expect(signOut).toHaveBeenCalledOnce()
  })
})

describe('Start over from every account control, HyperTrack accounts only', () => {
  beforeEach(() => { account.email = 'dev@hypertrack.io' })
  afterEach(() => { account.email = 'morgan@example.com' })

  it('adds Start over to the 1440px account menu and opens the typed confirm in the menu\'s place', () => {
    button(render(1440), 'Account menu').props.onClick!()
    const menu = find(render(1440), ({ props }) => props.role === 'menu')!
    const names = elements(menu).filter(({ type }) => type === 'button').map(({ props }) => text(props.children))
    expect(names).toEqual(['Onboarding', 'Start over', 'Log out'])
    expect(button(menu, 'Start over').props.role).toBe('menuitem')
    button(menu, 'Start over').props.onClick!()
    const opened = render(1440)
    expect(find(opened, ({ props }) => props.role === 'menu')).toBeUndefined()
    expect(button(opened, 'Account menu').props['aria-expanded']).toBe(true)
    const panel = find(opened, ({ props }) => props.className === 'sidebar-start-over')!
    const confirm = find(panel, ({ type }) => type === StartOver)!
    confirm.props.onClose!()
    const closed = render(1440)
    expect(find(closed, ({ type }) => type === StartOver)).toBeUndefined()
    expect(button(closed, 'Account menu').props['aria-expanded']).toBe(false)
  })

  it('adds Start over under Log out in the 390px drawer and expands the confirm inline', () => {
    button(render(390), 'Open sidebar').props.onClick!()
    const drawer = find(render(390), ({ props }) => props.role === 'dialog')!
    const names = elements(drawer).filter(({ type }) => type === 'button').map(({ props }) => props['aria-label'] ?? text(props.children))
    expect(names.slice(-2)).toEqual(['Log out', 'Start over'])
    button(drawer, 'Start over').props.onClick!()
    const opened = find(render(390), ({ props }) => props.role === 'dialog')!
    expect(find(opened, ({ type }) => type === StartOver)).toBeDefined()
    expect(button(opened, 'Start over')).toBeUndefined()
    expect(button(opened, 'Log out')).toBeDefined()
  })

  it('gives onboarding a quiet corner with the name, email, Log out and Start over, and no black button', () => {
    const tree = renderCorner()
    const panel = find(tree, ({ props }) => props.popover === 'auto')!
    expect(button(tree, 'Account menu').props.popoverTarget).toBe(panel.props.id)
    expect(text(panel)).toContain('Morgan Lee')
    expect(text(panel)).toContain('dev@hypertrack.io')
    expect(elements(tree).some(({ props }) => /\bprimary\b/.test(props.className ?? ''))).toBe(false)
    button(panel, 'Log out').props.onClick!()
    expect(signOut).toHaveBeenCalledOnce()
    button(panel, 'Start over').props.onClick!()
    const opened = find(renderCorner(), ({ props }) => props.popover === 'auto')!
    expect(find(opened, ({ type }) => type === StartOver)).toBeDefined()
    expect(button(opened, 'Log out')).toBeUndefined()
    // Dismissing the popover (outside click, Escape) puts the menu back for next time.
    opened.props.onToggle!({ newState: 'closed' })
    expect(find(renderCorner(), ({ type }) => type === StartOver)).toBeUndefined()
  })

  it('keeps Start over out of every placement for customer emails', () => {
    account.email = 'morgan@example.com'
    button(render(1440), 'Account menu').props.onClick!()
    expect(button(find(render(1440), ({ props }) => props.role === 'menu')!, 'Start over')).toBeUndefined()
    hooks.slots = []
    button(render(390), 'Open sidebar').props.onClick!()
    expect(button(find(render(390), ({ props }) => props.role === 'dialog')!, 'Start over')).toBeUndefined()
    hooks.slots = []
    const corner = renderCorner()
    expect(button(corner, 'Start over')).toBeUndefined()
    expect(button(corner, 'Log out')).toBeDefined()
  })

  it('never wipes without the typed confirm', async () => {
    const renderConfirm = () => { hooks.cursor = 0; return StartOver({ onClose() {} })! }
    const form = () => find(renderConfirm(), ({ type }) => type === 'form')!
    const submit = () => find(form(), ({ props }) => props.type === 'submit')!
    expect(submit().props.disabled).toBe(true)
    await form().props.onSubmit!({ preventDefault() {} })
    const input = find(form(), ({ type }) => type === 'input')!
    input.props.onChange!({ target: { value: 'start' } })
    await form().props.onSubmit!({ preventDefault() {} })
    expect(startOver).not.toHaveBeenCalled()
    input.props.onChange!({ target: { value: ' Start Over ' } })
    expect(submit().props.disabled).toBe(false)
    await form().props.onSubmit!({ preventDefault() {} })
    expect(startOver).toHaveBeenCalledWith(' Start Over ')
    // The 409 copy from the shared flow.
    expect(text(renderConfirm())).toContain('The Closeout Agent is mid-reply. Try again in a moment.')
  })
})
