import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export function chipLabel(value: string): string {
  if (value === 'all') return 'All'
  if (value === 'new') return 'Processing'
  if (value === 'qualified') return 'Qualified'
  if (value === 'invited') return 'Invited'
  if (value === 'meeting-scheduled') return 'Scheduled'
  if (value === 'met') return 'Done'
  if (value === 'disqualified') return 'Disqualified'
  if (value === 'no-show') return 'No-show'
  if (value === 'meetings') return 'Meetings'
  if (value === 'internal') return 'Internal'
  if (value === 'notes') return 'Notes'
  if (value === 'client') return 'Client'
  if (value === 'agency') return 'Agency'
  return value
}

export function FilterChip({
  value,
  selected,
  onClick,
  className,
  count,
}: {
  value: string
  selected: boolean
  onClick: () => void
  className?: string
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium',
        selected
          ? 'border border-border bg-muted text-foreground'
          : cn(
              className ?? 'border border-border/60 bg-transparent text-muted-foreground',
              'hover:bg-muted/50',
            ),
      )}
    >
      <span>{chipLabel(value)}</span>
      {count !== undefined && (
        <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
      )}
    </button>
  )
}

/** The shared filter-chip row (Memories + Sources). Search/filter go to the server. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  chipStyles,
  counts,
}: {
  options: readonly T[]
  value?: T
  onChange: (v: T) => void
  /** Per-value styling (e.g. the memory type tags) so the chips carry the taxonomy. */
  chipStyles?: Partial<Record<string, string>>
  counts?: Partial<Record<T, number>>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [pos, setPos] = useState<'start' | 'mid' | 'end'>('start')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      const max = el.scrollWidth - el.clientWidth
      const nextOverflowing = max > 1
      setOverflowing(nextOverflowing)
      setPos(
        !nextOverflowing || el.scrollLeft <= 1
          ? 'start'
          : el.scrollLeft >= max - 1
            ? 'end'
            : 'mid',
      )
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [options])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setPos(el.scrollLeft <= 1 ? 'start' : el.scrollLeft >= max - 1 ? 'end' : 'mid')
  }

  const mask = !overflowing
    ? undefined
    : pos === 'start'
      ? 'linear-gradient(to right, black calc(100% - 16px), transparent 100%)'
      : pos === 'end'
        ? 'linear-gradient(to right, transparent 0, black 16px)'
        : 'linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)'

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="flex min-w-0 flex-nowrap gap-1 overflow-x-auto no-scrollbar"
      style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
    >
      {options.filter((f) => f !== 'new').map((f) => (
        <FilterChip
          key={f}
          value={f}
          selected={value === f}
          onClick={() => onChange(f)}
          className={chipStyles?.[f]}
          count={counts?.[f]}
        />
      ))}
    </div>
  )
}
