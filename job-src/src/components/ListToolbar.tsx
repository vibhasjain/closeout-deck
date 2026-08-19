import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { FilterChips } from '@/components/FilterChips'

/** The one list toolbar (Memories + Sources): a collapsed search icon that expands
 * on demand, optional filter chips, and one action icon on the right. Same height
 * and border as the queue header and the ticket info bar, so the top lines of all
 * three panes align. */
export function ListToolbar<T extends string>({
  searchPlaceholder,
  q,
  onQ,
  options,
  filter,
  onFilter,
  chipStyles,
  counts,
  right,
}: {
  searchPlaceholder: string
  q: string
  onQ: (v: string) => void
  options: readonly T[]
  filter: T
  onFilter: (v: T) => void
  chipStyles?: Partial<Record<string, string>>
  counts?: Partial<Record<T, number>>
  right?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const collapse = () => {
    setOpen(false)
    onQ('')
  }

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 md:px-4">
      {open ? (
        // Searching takes the row — the chips step aside until the search closes.
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => onQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') collapse()
            }}
            placeholder={searchPlaceholder}
            className="h-9 min-w-0 flex-1"
          />
          <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Close search" onClick={collapse}>
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <Button size="icon" variant="ghost" className="size-9 shrink-0" aria-label="Search" onClick={() => setOpen(true)}>
            <Search className="size-4" />
          </Button>
          <div className="min-w-0 flex-1 md:hidden">
            <FilterChips
              options={options}
              value={filter}
              onChange={onFilter}
              chipStyles={chipStyles}
              counts={counts}
            />
          </div>
        </>
      )}
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  )
}
