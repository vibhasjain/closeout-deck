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

  if (status === 'meeting-scheduled') {
    return filtered.sort((a, b) => {
      if (!a.meetingAt) return b.meetingAt ? 1 : 0
      if (!b.meetingAt) return -1
      return new Date(a.meetingAt).getTime() - new Date(b.meetingAt).getTime()
    })
  }

  // Done reads newest-first — the call you just had is the one you want to open.
  if (status === 'met') return filtered.sort((a, b) => talkedAt(b) - talkedAt(a))

  return filtered
}

/** When the call actually happened; the recording beats the booked slot when they differ. */
export function callAt(candidate: Candidate): string | undefined {
  return candidate.meeting?.recordedAt ?? candidate.meetingAt
}

function talkedAt(candidate: Candidate): number {
  const at = callAt(candidate)
  return at ? new Date(at).getTime() : 0
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
