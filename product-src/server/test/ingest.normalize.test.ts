import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { key, libraryMapping, normalize, parseCsv, parseFile, type MappingSpec } from '../src/ingest.ts'

const meta = { fileId: 'f_fixture', sourceId: 'src_fixture' }
function fixture(name: string) { return parseFile(readFileSync(new URL(`fixtures/${name}`, import.meta.url)), name) }
function layout(name: string): MappingSpec { return { ...JSON.parse(readFileSync(new URL(`../mappings/${name}.json`, import.meta.url), 'utf8')), file: meta.fileId } }
const shift: MappingSpec = { v: 1, file: meta.fileId, set: 1, source: { system: 'Spreadsheet', site: 'Warehouse' }, headerRow: 1, grain: 'shift', overnight: 'next-day', columns: { worker: { col: 'Worker', name: 'first last' }, date: { col: 'Date', format: 'MM/DD/YYYY' }, start: { col: 'In', format: 'h:mm A' }, end: { col: 'Out', format: 'h:mm A' } } }

test('Bullhorn keeps 12 rows, overnight, exact duplicate, missing out, capture and source provenance', () => {
  const parsed = fixture('bullhorn.csv'), spec = libraryMapping(parsed, 'bullhorn_time_09-20-2026.csv', meta.fileId)!
  const result = normalize(parsed.grid, spec, meta)
  assert.equal(result.entries.length, 12); assert.deepEqual(result.unparsed, [])
  const [first, night, staff, duplicate, missing] = result.entries
  assert.equal(first.minutes, 480); assert.equal(first.mealMin, 30); assert.equal(first.workerKey, 'ana pena')
  assert.deepEqual([night.start, night.end], [1320, 1830]); assert.ok(night.flags.includes('overnight'))
  assert.equal(staff.capture, 'manual'); assert.equal(duplicate.dupOf, staff.id); assert.notEqual(duplicate.id, staff.id)
  assert.equal(missing.end, null); assert.equal(first.prov.file, meta.fileId); assert.equal(first.prov.row, 2); assert.equal(first.prov.cols.start, 'Start')
  assert.equal(spec.period?.end, '2026-09-20')
  assert.deepEqual(result, normalize(parsed.grid, spec, meta))
})
test('UKG preserves meal and split gaps, fill-down, schedules and skips total rows', () => {
  const result = normalize(fixture('ukg.csv').grid, layout('ukg'), meta)
  assert.equal(result.entries.length, 4); assert.equal(result.skipped, 1)
  assert.equal(result.entries[1].start! - result.entries[0].end!, 30)
  assert.equal(result.entries[3].start! - result.entries[2].end!, 75)
  assert.ok(result.entries[1].flags.includes('filled_down')); assert.equal(result.entries[1].worker, 'Ana Peña')
  assert.deepEqual(result.entries[0].sched, [360, 870]); assert.equal(result.entries[1].sched, null)
  assert.equal(result.entries[1].minutes, 480); assert.ok(!result.entries[1].flags.includes('hours_mismatch'))
})
test('ADP chains midnight pairs, keeps differential and next-period work dates', () => {
  const result = normalize(fixture('adp.csv').grid, layout('adp'), meta)
  assert.equal(result.entries.length, 5); assert.deepEqual(result.unparsed, [])
  assert.deepEqual(result.entries.slice(0, 2).map(e => [e.start, e.end]), [[1321, 1561], [1591, 1831]])
  assert.equal(result.entries[2].kind, 'diff'); assert.equal(result.entries[2].minutes, 480); assert.equal(result.entries[2].start, null)
  assert.equal(result.entries[3].workDate, '2026-09-21')
})
test('Daily approved hours have no invented clock times', () => {
  const spec: MappingSpec = { ...shift, grain: 'daily', set: 2, columns: { worker: shift.columns.worker, date: shift.columns.date, hours: { col: 'Hours', unit: 'decimal', per: 'row' } } }
  const result = normalize(fixture('daily-approved.csv').grid, spec, meta)
  assert.deepEqual(result.entries.map(e => [e.kind, e.start, e.end, e.minutes]), [['hours', null, null, 480], ['hours', null, null, 450]])
})
test('Time variants, missing out, zero length and malformed input', () => {
  const result = normalize(fixture('messy-times.csv').grid, shift, meta)
  assert.equal(result.entries.length, 7)
  assert.ok(result.entries.slice(0, 5).every(e => e.end! - e.start! === 480))
  assert.equal(result.entries[5].end, null); assert.ok(result.entries[6].flags.includes('zero_length'))
  assert.deepEqual(result.unparsed, [{ row: 9, reason: 'start is not h:mm A' }])
})
test('Datetime 26-hour span and dated-by-end retain the filed work date', () => {
  const long: MappingSpec = { ...shift, columns: { ...shift.columns, start: { col: 'In', format: 'YYYY-MM-DD HH:mm' }, end: { col: 'Out', format: 'YYYY-MM-DD HH:mm' } } }
  const result = normalize(parseCsv('Worker,Date,In,Out\nAna,09/14/2026,2026-09-14 06:00,2026-09-15 08:00'), long, meta)
  assert.equal(result.entries[0].end! - result.entries[0].start!, 1560); assert.ok(result.entries[0].flags.includes('over_24h'))
  const endDated = normalize(parseCsv('Worker,Date,In,Out\nAna,09/14/2026,10:00 PM,6:00 AM'), { ...shift, overnight: 'dated-by-end' }, meta).entries[0]
  assert.deepEqual([endDated.workDate, endDated.start, endDated.end], ['2026-09-14', -120, 360]); assert.ok(endDated.flags.includes('dated_by_end'))
})
test('DST fall-back is nine elapsed hours, spring-forward is seven', () => {
  const spec = { ...shift, timezone: 'America/Los_Angeles' }
  const fall = normalize(fixture('dst-2026-11-01.csv').grid, spec, meta).entries[0]
  assert.equal(fall.end! - fall.start!, 540); assert.ok(fall.flags.includes('dst'))
  const spring = normalize(parseCsv('Worker,Date,In,Out\nAna,03/07/2026,10:00 PM,6:00 AM'), spec, meta).entries[0]
  assert.equal(spring.end! - spring.start!, 420); assert.ok(spring.flags.includes('dst'))
  const gap = normalize(parseCsv('Worker,Date,In,Out\nAna,03/08/2026,2:30 AM,6:00 AM'), spec, meta)
  assert.equal(gap.entries.length, 0); assert.match(gap.unparsed[0].reason, /does not exist/)
})
test('Explicit meal columns become evidence entries and cross-check takes the meal once', () => {
  const spec: MappingSpec = { ...shift, columns: { ...shift.columns, mealStart: { col: 'Meal Start', format: 'HH:mm' }, mealEnd: { col: 'Meal End', format: 'HH:mm' }, hours: { col: 'Hours', unit: 'decimal', per: 'row' } } }
  const result = normalize(parseCsv('Worker,Date,In,Out,Meal Start,Meal End,Hours\nAna,09/14/2026,6:00 AM,2:30 PM,10:00,10:30,8'), spec, meta)
  assert.deepEqual(result.entries.map(e => e.kind), ['work', 'meal']); assert.equal(result.entries[1].end! - result.entries[1].start!, 30)
  assert.equal(result.entries[1].prov.cols.mealStart, 'Meal Start'); assert.equal(result.entries[0].flags.includes('hours_mismatch'), false)
})
test('Generated Kronos workbook keeps display strings, punch pairing, meals, provenance and orphan reasons', () => {
  const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet([
    ['Kronos clock punches'], ['Worker', 'Date', 'Time', 'Direction'],
    ['Peña, Ana', 46279, 0.25, 'IN'], ['Peña, Ana', 46279, 10 / 24, 'MEAL OUT'], ['Peña, Ana', 46279, 10.5 / 24, 'MEAL IN'], ['Peña, Ana', 46279, 14.5 / 24, 'OUT'],
    ['Ben', 46279, 0.25, 'OUT'], ['Cam', 46279, 0.25, 'IN'],
  ])
  for (let row = 3; row <= 8; row++) { sheet[`B${row}`].z = 'mm/dd/yyyy'; sheet[`C${row}`].z = '0.000000' }
  XLSX.utils.book_append_sheet(book, sheet, 'Punches')
  const parsed = parseFile(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'kronos-punches.xlsx')
  const spec: MappingSpec = { ...shift, sheet: 'Punches', headerRow: 2, grain: 'punch', columns: { worker: { col: 'Worker', name: 'last, first' }, date: shift.columns.date, start: { col: 'Time', format: 'excel-fraction' }, direction: { col: 'Direction', map: { IN: 'in', OUT: 'out', 'MEAL OUT': 'meal_out', 'MEAL IN': 'meal_in' } } } }
  const result = normalize(parsed.grid, spec, meta)
  assert.equal(parsed.headerRow, 2); assert.equal(parsed.grid[2][2], '0.250000')
  const work = result.entries.find(e => e.worker === 'Ana Peña' && e.kind === 'work')!, meal = result.entries.find(e => e.kind === 'meal')!
  assert.deepEqual([work.start, work.end], [360, 870]); assert.deepEqual([meal.start, meal.end], [600, 630])
  assert.equal(work.prov.sheet, 'Punches'); assert.equal(work.prov.row, 3); assert.equal(work.prov.cols.start, 'Time')
  assert.equal(result.entries.find(e => e.worker === 'Cam')?.end, null)
  assert.deepEqual(result.unparsed, [{ row: 7, reason: 'orphan_out' }])
})
test('Names, aliases, real dates, rates and ISO timestamps enforce canonical invariants', () => {
  assert.equal(key("  Peña, O'Neil-Smith!  "), "pena o'neil-smith")
  const spec: MappingSpec = { ...shift, timezone: 'America/Los_Angeles', columns: { ...shift.columns, start: { col: 'In', format: 'ISO' }, end: { col: 'Out', format: 'ISO' }, payRate: { col: 'Rate' } } }
  const grid = parseCsv('Worker,Date,In,Out,Rate\nAna,09/14/2026,2026-09-14T13:00:00Z,2026-09-14T21:00:00Z,$20.00\nAna,02/30/2026,2026-09-14T13:00:00Z,2026-09-14T21:00:00Z,20\nBen,09/14/2026,2026-09-14T13:00:00Z,2026-09-14T21:00:00Z,1001')
  const result = normalize(grid, spec, { ...meta, aliases: { 'src_fixture|Ana': 'canonical-worker' } })
  assert.equal(result.entries.length, 1); assert.deepEqual([result.entries[0].start, result.entries[0].end], [360, 840]); assert.equal(result.entries[0].workerKey, 'canonical-worker')
  assert.equal(result.unparsed.length, 2)
})
test('Offset-bearing timestamps preserve the repeated DST hour and reject rolled dates', () => {
  const spec: MappingSpec = { ...shift, timezone: 'America/Los_Angeles', columns: { ...shift.columns, start: { col: 'In', format: 'ISO' }, end: { col: 'Out', format: 'ISO' } } }
  const result = normalize(parseCsv('Worker,Date,In,Out\nAna,11/01/2026,2026-11-01T01:30:00-07:00,2026-11-01T01:30:00-08:00\nBen,02/28/2026,2026-02-30T06:00:00Z,2026-02-30T14:00:00Z'), spec, meta)
  assert.equal(result.entries.length, 1); assert.equal(result.entries[0].end! - result.entries[0].start!, 60); assert.ok(result.entries[0].flags.includes('dst'))
  assert.equal(result.unparsed.length, 1)
})
