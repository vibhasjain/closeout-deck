import assert from 'node:assert/strict'
import test from 'node:test'
import { fingerprint, guessHeader, IngestError, parseCsv, parseFile, sanitizeFileName } from '../src/ingest.ts'

test('CSV preserves quoted commas, escapes, CRLF, BOM and newlines within quotes', () => {
  assert.deepEqual(parseCsv('\uFEFFName,Note,Date\r\n"Peña, Ana","said ""hi""\r\nagain",09/14/2026\r\n'), [['Name', 'Note', 'Date'], ['Peña, Ana', 'said "hi"\r\nagain', '09/14/2026']])
  assert.throws(() => parseCsv('Name,Note\nAna,"unfinished'), /Unclosed/)
})
test('CSV sniffs semicolon, tab and pipe consistently despite quoted delimiters', () => {
  for (const delimiter of [';', '\t', '|']) assert.deepEqual(parseCsv(`Worker${delimiter}Date${delimiter}Hours\n"Ana, Peña"${delimiter}09/14/2026${delimiter}8\n`), [['Worker', 'Date', 'Hours'], ['Ana, Peña', '09/14/2026', '8']])
})
test('Windows-1252 fallback, title rows, profile and header fingerprint', () => {
  const parsed = parseFile(Buffer.from('Approved hours\r\nWeek ending September 20\r\nWorker;Date;Hours\r\nAna Pe\xf1a;09/14/2026;8\r\n', 'latin1'), 'hours.csv')
  assert.equal(parsed.headerRow, 3)
  assert.equal(parsed.grid[3][0], 'Ana Peña')
  assert.equal(guessHeader([['title'], ['2026'], ['a', 'b', 'c']]), 3)
  assert.match(parsed.profile, /Header row: 3/)
  assert.equal(parsed.fingerprint, fingerprint(parsed.grid, 3))
  assert.equal(fingerprint([[' Worker ', 'DATE', 'hours']], 1), fingerprint([['worker', 'date', 'hours']], 1))
  assert.notEqual(fingerprint([['a', 'b', 'c']], 1, 'A'), fingerprint([['a', 'b', 'c']], 1, 'B'))
})
test('Magic bytes determine PDFs and reject binary content disguised as CSV', () => {
  assert.equal(parseFile(Buffer.from('%PDF-1.7\n'), 'report.csv').kind, 'pdf')
  assert.throws(() => parseFile(Buffer.from([137, 80, 78, 71, 13, 10]), 'report.csv'), (e: unknown) => e instanceof IngestError && e.status === 415)
  assert.throws(() => parseFile(Buffer.from('<html>not a CSV</html>'), 'report.csv'), IngestError)
  assert.equal(sanitizeFileName('../../x.csv'), 'x.csv')
  assert.equal(sanitizeFileName('..\\x.csv'), 'x.csv')
})
