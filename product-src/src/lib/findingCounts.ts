import type { ResolutionGroup } from './resolution'

export interface FindingCounts { toDecide: number; waiting: number; total: number }

/** Both surfaces count the same triage groups; waiting evidence is not a decision. */
export function findingCounts(groups: Pick<ResolutionGroup, 'state'>[]): FindingCounts {
  const open = groups.filter(group => group.state !== 'fixed')
  const waiting = open.filter(group => group.state === 'waiting').length
  return { toDecide: open.length - waiting, waiting, total: open.length }
}
