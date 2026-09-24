interface Row {
  who: string
  site: string
  label: string
  why: string
  base: number
  value: number
}

const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`

export function correctionsCsv(rows: Row[]): string {
  const head = ['Worker', 'Worksite', 'Reason', 'Current', 'Corrected', 'Change']
  const body = rows.map((r) => [r.who, r.site, `${r.label}: ${r.why}`, r.base.toFixed(2), (r.base + r.value).toFixed(2), r.value.toFixed(2)])
  return [head, ...body].map((line) => line.map(cell).join(',')).join('\n')
}

/** Hands the browser a .csv of the approved corrections. */
export function downloadCorrections(rows: Row[], name: string) {
  const url = URL.createObjectURL(new Blob([correctionsCsv(rows)], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `corrections-${name}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
