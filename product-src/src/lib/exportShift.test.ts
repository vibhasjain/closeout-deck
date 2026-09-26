import { afterEach, describe, expect, it, vi } from 'vitest'
import { hydrate, type CyclePayload, type FileRecord } from '@/lib/data'
import { exportShiftRows } from '@/lib/exportShift'
import { DEFAULTS } from '@/lib/onboarding'
import fixture from '@/lib/fixtures/server-cycle.json'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('time-entry provenance download', () => {
  it('keeps source file and source row in the existing CSV download after the UI hides them', async () => {
    const cycle = hydrate(structuredClone(fixture.payload) as unknown as CyclePayload, DEFAULTS, fixture.files as FileRecord[])
    const anchor = { href: '', download: '', click: vi.fn() }
    const blobs: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { blobs.push(blob as Blob); return 'blob:test' })
    vi.stubGlobal('document', { createElement: () => anchor })
    vi.stubGlobal('window', { setTimeout: vi.fn() })
    exportShiftRows(cycle, cycle.run.shifts[1])
    expect(anchor.click).toHaveBeenCalledOnce()
    expect(anchor.download).toMatch(/^bullhorn_2026-09-20_shift_.+\.csv$/)
    const csv = await blobs[0].text()
    expect(csv).toContain('"Source file","Source row"')
    expect(csv).toContain('"bullhorn_2026-09-20.csv","3"')
  })
})
