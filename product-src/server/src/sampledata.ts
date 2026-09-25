import { readFileSync } from 'node:fs'
import { buildSample, CLIENTS, sampleCsvs, clock } from '../../src/lib/sample.ts'
import type { Cycle } from '../../src/lib/cycles.ts'
import type { FactInput } from './pipeline.ts'

export interface SampleFile { name: string; bytes: Buffer; set: 1 | 2 | 3 }
export const csvBytes = (rows: string[][]): Buffer => Buffer.from(rows.map(row => row.map(cell => /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(',')).join('\r\n') + '\r\n')
const date = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
const J = (k: number, spread = 5) => ((k * 37 + 11) % (2 * spread + 1)) - spread

/** These are real CSV bytes; callers seed facts, then use the ordinary ingestFile path for all four files. */
export function generateSample(cycle: Cycle): { files: SampleFile[]; facts: FactInput[] } {
  const sample = buildSample()
  const files: SampleFile[] = sampleCsvs(sample, cycle).map((file, i) => ({ name: file.name, bytes: csvBytes([file.header, ...file.rows]), set: i === 0 ? 1 : 2 }))
  const rows = sample.punches.map((p, i) => [p.worker, CLIENTS[p.client].name, date(new Date(cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate() + p.day)), clock(p.in - 5 - J(i, 2)), clock(p.out + 4 + J(i, 2))])
  files.push({ name: `hypertrack_location_${date(cycle.end).replaceAll('/', '-')}.csv`, set: 3, bytes: csvBytes([['Worker', 'Site', 'Date', 'Entered', 'Exited'], ...rows]) })
  const facts = JSON.parse(readFileSync(new URL('../mappings/sample-facts.json', import.meta.url), 'utf8')) as FactInput[]
  return { files, facts }
}
