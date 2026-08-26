import { MockFrame } from "@/components/mock-frame"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { MEMORY, MEMORY_STATS } from "@/data/shifts"
import { useCountUp, useSequence } from "@/lib/useSequence"

const MEMORY_STEPS = [600, 1500, 1500, 1500, 1500, 1500, 1500]

const STAT_LABELS = [
  ["rules", "rules"],
  ["facilities", "facilities"],
  ["people", "people"],
  ["weeks", "weeks"],
] as const

function MemoryStats({
  progress,
  animate,
}: {
  progress: number
  animate: boolean
}) {
  const rules = useCountUp(
    Math.round(MEMORY_STATS.rules * progress),
    650,
    animate
  )
  const values = {
    rules,
    facilities: MEMORY_STATS.facilities,
    people: MEMORY_STATS.people,
    weeks: MEMORY_STATS.weeks,
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
        {STAT_LABELS.map(([key, label]) => (
          <div key={key} className="grid gap-1 bg-card p-3">
            <span className="font-mono text-2xl font-medium tabular-nums">
              {Math.round(values[key])}
            </span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3 font-mono text-xs text-muted-foreground tabular-nums">
          <span>week 1</span>
          <span>week 52</span>
        </div>
        <Progress
          aria-label="Memory accumulated from week 1 toward week 52"
          value={(MEMORY_STATS.weeks / 52) * 100 * progress}
          className="[&>[data-slot=progress-indicator]]:duration-700 [&>[data-slot=progress-indicator]]:ease-[cubic-bezier(0.16,1,0.3,1)]"
        />
      </div>
    </div>
  )
}

export function MemoryLedger() {
  const { phase, ref, reduced } = useSequence(MEMORY_STEPS, {
    restartDelay: 2800,
  })
  const entryCount = reduced ? MEMORY.length : Math.min(phase, MEMORY.length)
  const progress = entryCount / MEMORY.length

  return (
    <MockFrame
      frameRef={ref}
      title="agent · operation memory"
      ariaLabel="Animated memory ledger showing six synthetic operational lessons accumulating while its rule count increases and its facility, people, and week totals remain visible."
      contentClassName="py-4"
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(15rem,0.75fr)]">
        <div className="min-h-96 min-w-0 rounded-lg border bg-background px-3">
          {MEMORY.slice(0, entryCount).map((entry) => (
            <div
              key={entry.date}
              className="animate-row-in grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-b py-3 last:border-b-0 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center"
            >
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {entry.date}
              </span>
              <span className="min-w-0 text-sm leading-5 text-foreground">
                {entry.text}
              </span>
              <Badge
                variant="secondary"
                className="col-start-2 w-fit font-normal sm:col-start-auto"
              >
                learned
              </Badge>
            </div>
          ))}
        </div>

        <MemoryStats
          key={entryCount === 0 ? "idle" : "active"}
          progress={progress}
          animate={!reduced && entryCount > 0}
        />
      </div>
    </MockFrame>
  )
}
