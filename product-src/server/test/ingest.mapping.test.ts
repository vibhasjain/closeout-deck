import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inferPeriod, libraryMapping, parseCsv, parseFile, validateMapping, type MappingSpec } from '../src/ingest.ts'

const meta = { fileId: 'f_test', sourceId: 'src_test', status: 'needs_mapping', today: '2026-09-25', method: 'upload' as const }
const grid = parseCsv('Worker,Date,In,Out,Break,Hours,Code\nAna,09/14/2026,6:00 AM,2:30 PM,30,8,REG\nBen,09/15/2026,6:00 AM,2:30 PM,30,8,REG')
const spec: MappingSpec = { v: 1, file: meta.fileId, set: 1, source: { system: 'Spreadsheet', site: 'Warehouse' }, headerRow: 1, grain: 'shift', overnight: 'next-day', columns: {
  worker: { col: 'Worker', name: 'first last' }, date: { col: 'Date', format: 'MM/DD/YYYY' }, start: { col: 'In', format: 'h:mm A' }, end: { col: 'Out', format: 'h:mm A' },
  breakMin: { col: 'Break', unit: 'minutes' }, hours: { col: 'Hours', unit: 'decimal', per: 'row' }, payCode: { col: 'Code', map: { REG: 'work' } },
} }
const errors = (change: unknown, input = grid) => validateMapping(change, input, meta).errors.join('\n')

test('Mapping schema is strict at every level and rejects unknown columns', () => {
  assert.equal(validateMapping(spec, grid, meta).ok, true)
  for (const invalid of [{ ...spec, executable: 'no' }, { ...spec, source: { ...spec.source, script: 'no' } }, { ...spec, columns: { ...spec.columns, worker: { ...spec.columns.worker, eval: 'no' } } }, { ...spec, period: { end: '2026-09-20', extra: true } }, { ...spec, skip: [{ col: 'Worker', equals: ['Total'], extra: true }] }]) assert.match(errors(invalid), /Unknown/)
  assert.match(errors({ ...spec, columns: { ...spec.columns, start: { col: 'Scheduled Start', format: 'h:mm A' } } }), /Unknown column/)
  assert.match(errors({ ...spec, columns: { ...spec.columns, end: { col: 'In', format: 'h:mm A' } } }), /mapped more than once/)
  assert.match(errors('{oops'), /valid JSON/)
})
test('Wrong date format, non-total maps and missing required columns are rejected', () => {
  assert.match(errors({ ...spec, columns: { ...spec.columns, date: { col: 'Date', format: 'DD/MM/YYYY' } } }), /98%/)
  assert.match(errors({ ...spec, columns: { ...spec.columns, payCode: { col: 'Code', map: {} } } }), /Unmapped payCode/)
  for (const grain of ['shift', 'pair', 'punch', 'daily']) {
    const bad = { ...spec, grain, columns: { worker: spec.columns.worker, date: spec.columns.date } }
    assert.match(errors(bad), /Missing required/)
  }
})
test('Dry run catches missing break mapping, no site, hint contradiction and user location', () => {
  const columns = { ...spec.columns }; delete columns.breakMin
  assert.match(errors({ ...spec, columns }), /Hours disagrees with the times: check the break\/meal mapping/)
  assert.match(errors({ ...spec, source: { system: 'Spreadsheet' } }), /site column/)
  assert.match(errors({ ...spec, set: 3 }), /set 3 is not allowed/)
  assert.match(validateMapping(spec, grid, { ...meta, setHint: 2 }).errors.join('\n'), /contradicts/)
  assert.match(errors({ ...spec, file: 'another-accounts-file' }), /this account file/)
  assert.match(errors({ ...spec, sheet: 'Absent' }), /sheet does not exist/)
})
test('All four library mappings pass the full validator', () => {
  for (const file of ['bullhorn', 'ukg', 'adp', 'hypertrack-location']) {
    const parsed = file === 'hypertrack-location' ? parseFile(Buffer.from('Worker,Site,Date,Entered,Exited\nAna,Warehouse,09/14/2026,5:55 AM,2:35 PM'), 'hypertrack_location_09-20-2026.csv') : parseFile(readFileSync(new URL(`fixtures/${file}.csv`, import.meta.url)), `${file}_09-20-2026.csv`)
    const mapping = libraryMapping(parsed, `${file}_09-20-2026.csv`, meta.fileId)
    assert.ok(mapping)
    const result = validateMapping(mapping, parsed.grid, { ...meta, method: 'simulated', sample: true })
    assert.equal(result.ok, true, `${file}: ${result.errors.join('; ')}`)
  }
})
test('Whole-file dry run enforces age, period, median and row thresholds', () => {
  assert.match(errors(spec, grid.map(row => row.map(s => s.replace('2026', '2020')))), /400 days/)
  assert.match(errors({ ...spec, period: { end: '2026-08-01' } }), /within 7 days/)
  const noHours = { ...spec, columns: { worker: spec.columns.worker, date: spec.columns.date, start: spec.columns.start!, end: spec.columns.end! } }
  assert.match(errors(noHours, parseCsv('Worker,Date,In,Out\nAna,09/14/2026,6:00 AM,6:30 AM')), /in\/out look swapped or scheduled/)
  assert.match(errors(noHours, parseCsv('Worker,Date,In,Out\nAna,09/14/2026,6:00 AM,2:00 PM\nBen,not a date,6:00 AM,2:00 PM')), /More than 2%/)
})
test('Punch datetime-only mappings expand date/start, with total direction codes', () => {
  const input = { ...spec, grain: 'punch', columns: { worker: spec.columns.worker, start: { col: 'When', format: 'ISO' }, direction: { col: 'Direction', map: { IN: 'in', OUT: 'out' } } } }
  const result = validateMapping(input, parseCsv('Worker,When,Direction\nAna,2026-09-14T06:00:00Z,IN\nAna,2026-09-14T14:00:00Z,OUT'), meta)
  assert.equal(result.ok, true, result.errors.join('; ')); assert.equal(result.result!.entries[0].end! - result.result!.entries[0].start!, 480)
})
test('The current export period is inferred independently of cached library layouts', () => {
  assert.deepEqual(inferPeriod('custom_timesheet_09-27-2026.csv'), { end: '2026-09-27' })
  assert.deepEqual(inferPeriod('hypertrack_location_2026-09-27.csv'), { end: '2026-09-27' })
  assert.equal(inferPeriod('timesheet.csv'), undefined)
  assert.equal(inferPeriod('custom_02-30-2026.csv'), undefined)
})
