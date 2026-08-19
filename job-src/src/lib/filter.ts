import type { Candidate, Status } from '../types.ts'

export type CandidateFilter = 'all' | Status | 'meetings'

export const PIPELINE_FILTERS = ['all', 'drafted', 'awaiting-reply', 'disqualified'] as const
export type PipelineFilter = (typeof PIPELINE_FILTERS)[number]

export function filterCandidates(
  candidates: Candidate[],
  status: CandidateFilter,
  query: string,
): Candidate[] {
  const q = query.trim().toLowerCase()
  return candidates.filter((candidate) => {
    const matchesStatus =
      status === 'all' ||
      (status === 'meetings'
        ? candidate.status === 'meeting-scheduled' || candidate.status === 'met'
        : candidate.status === status)
    if (!matchesStatus) return false
    if (!q) return true
    return [candidate.name, candidate.email, candidate.summary].some((value) =>
      value.toLowerCase().includes(q),
    )
  })
}
