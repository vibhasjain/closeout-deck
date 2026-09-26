import { describe, expect, it } from 'vitest'
import { agentOrb, callActivity, type AgentActivity } from './agentMotion'

describe('one orb vocabulary across surfaces', () => {
  it('uses a fixed mode for each activity and rests at idle', () => {
    expect(agentOrb('idle')).toEqual({ state: 'breathing', paused: true })
    expect(agentOrb('thinking')).toEqual({ state: 'composing', paused: false })
    expect(agentOrb('listening')).toEqual({ state: 'listening', paused: false })
    expect(agentOrb('processing')).toEqual({ state: 'working', paused: false })
  })
  it.each(['idle', 'thinking', 'listening', 'processing'] as AgentActivity[])('makes %s static under reduced motion', state => {
    expect(agentOrb(state, true)).toEqual({ state: 'breathing', paused: true })
  })
  it('adapts call transport states to the same semantic states', () => {
    expect(callActivity('connecting')).toBe('processing')
    expect(callActivity('working')).toBe('processing')
    expect(callActivity('composing')).toBe('thinking')
    expect(callActivity('listening')).toBe('listening')
  })
})
