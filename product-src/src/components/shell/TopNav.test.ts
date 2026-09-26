import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopNav } from './TopNav'
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
  onClick?(): void
}
const elements = (node: ReactNode): ReactElement<Props>[] => Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [])
const text = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<Props>(child) ? text(child.props.children) : String(child)).join('')
const button = (node: ReactNode, name: string) => elements(node).find(({ type, props }) => type === 'button' && (props['aria-label'] === name || text(props.children) === name))!
const render = (width: number) => { hooks.cursor = 0; return TopNav({ wide: width >= 1024 }) }

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
    expect(image.props.src).toMatch(/hypertrack-logo\.svg$/)
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
