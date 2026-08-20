import assert from 'node:assert/strict'
import { filterCandidates, PIPELINE_FILTERS, selectionForCandidates } from './src/lib/filter.ts'
import { parseStatus } from './src/lib/status.ts'
import {
  attachmentExtension,
  autoOpenAttachment,
  getAttachmentRenderDispatch,
} from './src/lib/attachmentPreview.ts'

const candidates = [
  {
    id: 'c-maya',
    name: 'Maya Patel',
    email: 'maya@example.com',
    appliedAt: '2026-01-01T00:00:00.000Z',
    source: 'email',
    status: 'qualified',
    summary: 'Ready for an introductory conversation.',
    thread: [],
  },
  {
    id: 'c-theo',
    name: 'Theo Martin',
    email: 'theo.example@example.com',
    appliedAt: '2026-01-02T00:00:00.000Z',
    source: 'linkedin',
    status: 'meeting-scheduled',
    summary: 'Interview scheduled.',
    thread: [],
  },
  {
    id: 'c-rina',
    name: 'Rina Shah',
    email: 'rina@example.com',
    appliedAt: '2026-01-03T00:00:00.000Z',
    source: 'email',
    status: 'met',
    summary: 'Finished the first interview.',
    thread: [],
  },
]

assert.equal(filterCandidates(candidates, 'all', '').length, candidates.length)
assert.deepEqual(
  PIPELINE_FILTERS.filter((filter) => filter !== 'new'),
  ['all', 'disqualified', 'qualified', 'invited', 'meeting-scheduled', 'met'],
)
assert.deepEqual(
  filterCandidates(candidates, 'meetings', '').map((candidate) => candidate.status).sort(),
  ['meeting-scheduled', 'met'],
)
assert.ok(filterCandidates(candidates, 'qualified', '').every((candidate) => candidate.status === 'qualified'))
assert.equal(filterCandidates(candidates, 'all', 'maya').length, 1)
assert.equal(filterCandidates(candidates, 'all', 'THEO.EXAMPLE@EXAMPLE.COM').length, 1)
assert.equal(filterCandidates(candidates, 'all', 'introductory conversation').length, 1)

const qualifiedCandidates = filterCandidates(candidates, 'qualified', '')
const meetingCandidates = filterCandidates(candidates, 'meetings', '')
assert.equal(selectionForCandidates(qualifiedCandidates, 'c-maya'), 'c-maya')
assert.equal(selectionForCandidates(meetingCandidates, 'c-maya'), 'c-theo')
assert.equal(selectionForCandidates([], 'c-maya'), null)

assert.equal(parseStatus('drafted'), 'qualified')
assert.equal(parseStatus('awaiting-reply'), 'invited')
assert.equal(parseStatus('sent'), 'invited')
assert.equal(parseStatus('calendly-sent'), 'invited')
assert.equal(parseStatus('meeting-scheduled'), 'meeting-scheduled')
assert.equal(parseStatus('met'), 'met')

assert.equal(attachmentExtension('Resume.DOCX?download=1#page=2'), 'docx')
assert.equal(getAttachmentRenderDispatch({ name: 'Resume.DOCX?download=1' }).kind, 'docx')
assert.equal(getAttachmentRenderDispatch({ name: 'photo.JPEG?raw=1' }).kind, 'image')
assert.equal(getAttachmentRenderDispatch({ name: 'notes.MD#top' }).kind, 'text')
assert.equal(getAttachmentRenderDispatch({ name: 'archive.ZIP?download=1' }).kind, 'fallback')

const autoOpenedAttachment = autoOpenAttachment([
  { name: 'portfolio.zip', path: 'files/c-maya/portfolio.zip' },
  { name: 'Resume.DOCX?download=1', path: 'files/c-maya/resume.docx' },
])
assert.equal(autoOpenedAttachment?.name, 'Resume.DOCX?download=1')
assert.equal(autoOpenedAttachment && getAttachmentRenderDispatch(autoOpenedAttachment).kind, 'docx')

for (const candidate of candidates) {
  for (const field of ['id', 'name', 'email', 'appliedAt', 'status', 'summary', 'thread']) {
    assert.ok(field in candidate, `${candidate.id} is missing ${field}`)
  }
  assert.ok(Array.isArray(candidate.thread), `${candidate.id} thread must be an array`)
}

console.log('job dashboard checks passed')
