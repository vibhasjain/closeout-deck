import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import { useSearchParams } from 'react-router-dom'
import { money } from '@/bench/engine.js'
import { Btn, Tag } from '@/components/ui'
import type { DeskCycle } from '@/lib/desk'

const ROW_H = 43
const dateLabel = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const fullDate = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

/** Keep a complete page of cycles and its controls inside the available pane. */
export function CyclesTable({ cycles, selected, onSelect }: { cycles: DeskCycle[]; selected?: string; onSelect(id: string): void }): JSX.Element {
  const [params, setParams] = useSearchParams()
  const [perPage, setPerPage] = useState(12)
  const wrapRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLTableSectionElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const head = headRef.current
    if (!wrap || !head) return
    const measure = () => {
      // clientHeight excludes a horizontal scrollbar on narrow panes. Measuring
      // the live header also accounts for wrapping at smaller viewport widths.
      const row = wrap.querySelector<HTMLTableRowElement>('tbody tr[data-cycle]')
      const rowHeight = row?.getBoundingClientRect().height || ROW_H
      const available = wrap.clientHeight - head.getBoundingClientRect().height - 1
      setPerPage(Math.max(1, Math.floor(available / rowHeight)))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    observer.observe(head)
    const frame = window.requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
    }
  }, [])

  const requestedPage = Number(params.get('page') ?? 1)
  const pageCount = Math.max(1, Math.ceil(cycles.length / perPage))
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1))
  const first = (page - 1) * perPage
  const visible = cycles.slice(first, first + perPage)

  function goToPage(next: number) {
    setParams((previous) => {
      const search = new URLSearchParams(previous)
      if (next === 1) search.delete('page')
      else search.set('page', String(next))
      return search
    })
  }

  return <div className="cycles-view" style={{ '--cycle-row-h': `${ROW_H}px` } as CSSProperties}>
    <div className="cycles-table-wrap" ref={wrapRef}>
      <table className="sheet cycles-sheet" aria-label="Pay cycles">
        <thead ref={headRef}><tr>
          <th scope="col">Start</th><th scope="col">End</th><th scope="col">Pay date</th>
          <th scope="col" className="num cycle-edge">Payments</th><th scope="col" className="num">Workers</th>
          <th scope="col" className="num">Gross</th><th scope="col" className="num cycle-edge">Flagged</th>
          <th scope="col" className="num">Held</th><th scope="col" className="num">Corrections</th>
          <th scope="col" className="cycle-edge">Status</th>
        </tr></thead>
        <tbody>{visible.map((cycle) => {
          const workers = new Set(cycle.week.map((shift) => shift.worker)).size
          const gross = cycle.run.shifts.reduce((total, shift) => total + shift.pay, 0)
          const { flags, held, under, over } = cycle.run.totals
          return <tr
            key={cycle.id}
            data-cycle={cycle.id}
            className={selected === cycle.id ? 'sel' : undefined}
            tabIndex={0}
            aria-label={`${cycle.label}, ${cycle.statusTag}; open cycle`}
            onClick={() => onSelect(cycle.id)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(cycle.id)
              }
            }}
          >
            <td><Btn className="cycle-start mono" title={fullDate(cycle.start)} aria-label={`Open pay cycle ${cycle.label}`} onClick={(event) => { event.stopPropagation(); onSelect(cycle.id) }}>{dateLabel(cycle.start)}</Btn></td>
            <td className="mono" title={fullDate(cycle.end)}>{dateLabel(cycle.end)}</td>
            <td className="mono" title={fullDate(cycle.payDate)}>{dateLabel(cycle.payDate)}</td>
            <td className="num mono cycle-edge">{cycle.week.length}</td>
            <td className="num mono">{workers}</td>
            <td className="num mono">{money(gross)}</td>
            <td className="num mono cycle-edge">{flags}</td>
            <td className="num mono">{held}</td>
            <td className="num mono">+{money(under)} / −{money(over)}</td>
            <td className="cycle-edge"><Tag tone={cycle.statusTag === 'Pending' ? 'amber' : undefined}>{cycle.statusTag}</Tag></td>
          </tr>
        })}</tbody>
      </table>
    </div>
    <div className="cycles-pagination">
      <span className="count"><span className="mono">{cycles.length ? first + 1 : 0}–{first + visible.length}</span> of <span className="mono">{cycles.length}</span> cycles</span>
      <div className="flex items-center gap-2">
        <Btn disabled={page === 1} onClick={() => goToPage(page - 1)}>Previous</Btn>
        <span className="count mono" aria-label={`Page ${page} of ${pageCount}`}>{page} / {pageCount}</span>
        <Btn disabled={page === pageCount} onClick={() => goToPage(page + 1)}>Next</Btn>
      </div>
    </div>
  </div>
}
