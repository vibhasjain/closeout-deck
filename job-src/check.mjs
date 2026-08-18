import assert from 'node:assert/strict'
import { filterCandidates } from './src/lib/filter.ts'
import { sampleFeed } from './src/sampleFeed.ts'

const candidates = [
  ...sampleFeed.candidates,
  {
    ...sampleFeed.candidates[0],
    id: 'c-sample-met',
    name: 'Met Person',
    email: 'met.person@example.com',
    status: 'met',
    summary: 'Finished the first interview.',
  },
]

assert.equal(filterCandidates(candidates, 'all', '').length, candidates.length)
assert.deepEqual(
  filterCandidates(candidates, 'meetings', '').map((candidate) => candidate.status).sort(),
  ['meeting-scheduled', 'met'],
)
assert.ok(filterCandidates(candidates, 'drafted', '').every((candidate) => candidate.status === 'drafted'))
assert.equal(filterCandidates(candidates, 'all', 'maya').length, 1)
assert.equal(filterCandidates(candidates, 'all', 'THEO.EXAMPLE@EXAMPLE.COM').length, 1)
assert.equal(filterCandidates(candidates, 'all', 'introductory conversation').length, 1)

for (const candidate of sampleFeed.candidates) {
  for (const field of ['id', 'name', 'email', 'appliedAt', 'status', 'summary', 'thread']) {
    assert.ok(field in candidate, `${candidate.id} is missing ${field}`)
  }
  assert.ok(Array.isArray(candidate.thread), `${candidate.id} thread must be an array`)
}

console.log('job dashboard checks passed')
