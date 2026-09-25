import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './api'
import * as onboarding from './onboarding'
import * as session from './viewerSession'
import { DEFAULTS, type Onboarding } from './onboarding'
import { connectSource } from './data'
import { pipelineRunning, startPipeline } from './pipeline'
import { recentCycles } from './cycles'

let state: Onboarding
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
beforeEach(() => {
  state = structuredClone(DEFAULTS)
  vi.spyOn(onboarding, 'getOnboarding').mockImplementation(() => state)
  vi.spyOn(onboarding, 'updateOnboarding').mockImplementation(patch => { state = { ...state, ...patch } })
  vi.spyOn(onboarding, 'flushOnboarding').mockResolvedValue()
  vi.spyOn(session, 'viewerSession').mockReturnValue({ email: crypto.randomUUID(), sessionToken: 'local-test', exp: 9999999999 })
})
afterEach(() => vi.restoreAllMocks())

describe('pipeline task publication', () => {
  it('posts the cycle task before the connection resolves, then stops on real completion', async () => {
    let complete!: (value: Response) => void
    const connection = new Promise<Response>(resolve => { complete = resolve })
    vi.spyOn(api, 'authedFetch').mockImplementation(path => path === '/data/connect' ? connection
      : Promise.resolve(response(path === '/files' ? { files: [] } : { cycles: [], sources: [] })))
    const work = connectSource({ set: 1, system: 'Sample' })
    await Promise.resolve()
    const cycleId = recentCycles(state, 2)[1].id
    expect(state.chat.at(-1)?.cards).toEqual([{ kind: 'task', cycleId }])
    expect(pipelineRunning(cycleId)).toBe(true)
    complete(response({ files: [], cycles: [cycleId] }))
    await work
    expect(pipelineRunning(cycleId)).toBe(false)
  })
  it('does not invent a run or remain running after a failed connection', async () => {
    vi.spyOn(api, 'authedFetch').mockResolvedValue(response({ error: 'offline' }, 503))
    await expect(connectSource({ set: 2 })).rejects.toThrow('offline')
    expect(pipelineRunning(recentCycles(state, 2)[1].id)).toBe(false)
    expect(state.chat.at(-1)?.cards?.[0]).toEqual({ kind: 'task', cycleId: recentCycles(state, 2)[1].id })
  })
  it('keeps concurrent set loads running until all finish, without duplicate task cards', () => {
    const a = startPipeline('cycle-a'), b = startPipeline('cycle-a')
    expect(state.chat).toHaveLength(1)
    // Only the card this run posted shows it; an older task card of the same cycle keeps its own state.
    expect(pipelineRunning('cycle-a', state.chat[0].id)).toBe(true)
    expect(pipelineRunning('cycle-a', 'an-older-task-card')).toBe(false)
    a(); a()
    expect(pipelineRunning('cycle-a')).toBe(true)
    b()
    expect(pipelineRunning('cycle-a')).toBe(false)
  })
  it('isolates pipeline state by account', () => {
    const done = startPipeline('cycle-a')
    vi.mocked(session.viewerSession).mockReturnValue({ email: 'different@example.com', sessionToken: 'local-test', exp: 9999999999 })
    expect(pipelineRunning('cycle-a')).toBe(false)
    done()
  })
  it('does not start a connection or post into an account selected during a pending state flush', async () => {
    let complete!: () => void
    vi.mocked(onboarding.flushOnboarding).mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const fetch = vi.spyOn(api, 'authedFetch')
    const work = connectSource({ set: 1 })
    vi.mocked(session.viewerSession).mockReturnValue({ email: 'different@example.com', sessionToken: 'local-test', exp: 9999999999 })
    complete()
    await expect(work).rejects.toThrow('account changed')
    expect(fetch).not.toHaveBeenCalled()
    expect(state.chat).toHaveLength(0)
  })
  it('does not publish a completed connection into an account selected during the request', async () => {
    let complete!: (value: Response) => void
    vi.spyOn(api, 'authedFetch').mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const work = connectSource({ set: 1 })
    await Promise.resolve()
    vi.mocked(onboarding.updateOnboarding).mockClear()
    vi.mocked(session.viewerSession).mockReturnValue({ email: 'different@example.com', sessionToken: 'local-test', exp: 9999999999 })
    complete(response({ files: [], cycles: [] }))
    await expect(work).rejects.toThrow('account changed')
    expect(onboarding.updateOnboarding).not.toHaveBeenCalled()
  })
  it('reports a failed refresh even when the connection request succeeded', async () => {
    vi.spyOn(api, 'authedFetch').mockImplementation(path => path === '/data/connect'
      ? Promise.resolve(response({ files: [], cycles: [] })) : Promise.reject(new Error('Data refresh unavailable')))
    await expect(connectSource({ set: 1 })).rejects.toThrow('Data refresh unavailable')
    expect(pipelineRunning(recentCycles(state, 2)[1].id)).toBe(false)
  })
})
