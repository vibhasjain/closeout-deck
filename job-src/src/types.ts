export type Status =
  | 'new' | 'drafted' | 'sent' | 'awaiting-reply'
  | 'calendly-sent' | 'meeting-scheduled' | 'met' | 'disqualified'

export interface Attachment { name: string; path: string }

export interface ThreadEntry {
  id: string
  dir: 'in' | 'out' | 'internal'
  at: string                 // ISO
  subject?: string
  text: string
  attachments?: Attachment[]
}

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
  appliedAt: string
  source: 'email' | 'linkedin'
  status: Status
  summary: string            // one-line, for the left list
  flags?: string[]
  thread: ThreadEntry[]      // chronological
  draft?: Draft | null       // null when nothing pending
  trail?: TrailEntry[]
}

export interface Meeting {
  candidateId: string
  at: string
  source: string
  status: 'scheduled' | 'done' | 'canceled'
}

export interface Feed {
  updatedAt: string
  candidates: Candidate[]
  meetings?: Meeting[]
}
