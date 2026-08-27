import type { Candidate, Segment, Status } from '../types.ts'

export type CandidateFilter = 'all' | Status | 'meetings' | Segment

export const PIPELINE_FILTERS = ['all', 'new', 'disqualified', 'no-show', 'qualified', 'invited', 'meeting-scheduled', 'met', 'client', 'agency'] as const
export type PipelineFilter = (typeof PIPELINE_FILTERS)[number]

export function filterCandidates(
  candidates: Candidate[],
  status: CandidateFilter,
  query: string,
): Candidate[] {
  const q = query.trim().toLowerCase()
  const filtered = candidates.filter((candidate) => {
    const matchesStatus =
      status === 'all' ||
      (status === 'meetings'
        ? candidate.status === 'meeting-scheduled' || candidate.status === 'met'
        : status === 'client' || status === 'agency'
          ? candidate.segment === status
          : candidate.status === status)
    if (!matchesStatus) return false
    if (!q) return true
    return [candidate.name, candidate.email, candidate.summary].some((value) =>
      value.toLowerCase().includes(q),
    )
  })

  if (status !== 'meeting-scheduled') return filtered

  return filtered.sort((a, b) => {
    if (!a.meetingAt) return b.meetingAt ? 1 : 0
    if (!b.meetingAt) return -1
    return new Date(a.meetingAt).getTime() - new Date(b.meetingAt).getTime()
  })
}

export function selectionForCandidates(
  candidates: Candidate[],
  selectedId: string | null,
): string | null {
  if (selectedId && candidates.some((candidate) => candidate.id === selectedId)) {
    return selectedId
  }
  return candidates[0]?.id ?? null
}
