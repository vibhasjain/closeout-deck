import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('API base', () => {
  it.each([
    [true, 'https://closeout-agent.fly.dev'],
    [false, '/api'],
  ] as const)('routes PROD=%s calls to %s', async (production, base) => {
    vi.stubEnv('PROD', production)
    vi.resetModules()
    expect((await import('./api')).API_BASE).toBe(base)
  })
})
