export type Status =
  | 'new' | 'qualified' | 'invited'
  | 'meeting-scheduled' | 'met' | 'disqualified' | 'no-show'

/** Client = runs its own hourly workforce; agency = supplies workers to other businesses
 *  (staffing/temp agencies, gig-staffing marketplaces) — the two-timesheet case. */
export type Segment = 'client' | 'agency'

export interface Attachment { name: string; path: string }

export interface ThreadEntry {
  id: string
  dir: 'in' | 'out' | 'internal'
  at: string                 // ISO
  kind?: 'meeting'
  loomUrl?: string
  loomId?: string
  subject?: string
  text: string
  attachments?: Attachment[]
}

export interface MeetingRecording {
  loomUrl: string
  loomId: string
  title?: string
  recordedAt?: string
  durationSec?: number
  summaryPath?: string
  transcriptPath?: string
}

export type MeetingPaneTab = 'summary' | 'transcript' | 'resume'

export interface Draft {
  id: string
  subject: string
  text: string
  createdAt: string
  rationale: string
}

export interface TrailEntry {
  at: string
  action: 'ingested' | 'drafted' | 'revised' | 'sent' | 'status'
  detail: string
}

export interface Candidate {
  id: string                 // "c-<slug>"
  name: string
  email: string
  linkedinUrl?: string
  appliedAt: string
  source: 'email' | 'linkedin'
  status: Status
  segment?: Segment
  meetingAt?: string
  meetingEnd?: string
  meetLink?: string
  summary: string            // one-line, for the left list
  flags?: string[]
  thread: ThreadEntry[]      // chronological
  meeting?: MeetingRecording
  draft?: Draft | null       // null when nothing pending
  trail?: TrailEntry[]
}

export interface Meeting {
  candidateId: string
  at: string
  source: string
  status: 'scheduled' | 'done' | 'canceled'
}

export interface Discussion {
  id: string
  title: string
  recordedAt?: string
  durationSec?: number
  source?: string
  tags?: string[]
  speakers?: Record<string, string>
  summaryPath: string
  transcriptPath: string
}

export interface Feed {
  updatedAt: string
  candidates: Candidate[]
  meetings?: Meeting[]
  discussions?: Discussion[]
}
