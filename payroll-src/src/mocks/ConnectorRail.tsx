import type { ReactNode } from "react"
import { ArrowRight, FileText } from "lucide-react"

import { MockFrame } from "@/components/mock-frame"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { SHIFTS } from "@/data/shifts"
import { money } from "@/lib/format"
import { useSequence } from "@/lib/useSequence"
import { cn } from "@/lib/utils"

const CONNECTOR_STEPS = [250, 900, 900, 900, 900]

function RailNode({
  title,
  active,
  resetting,
  children,
}: {
  title: string
  active: boolean
  resetting: boolean
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background p-3">
      <div className="font-heading text-sm font-medium text-foreground">
        {title}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      <Progress
        aria-label={`${title} transfer progress`}
        value={active ? 100 : 0}
        className={cn(
          "[&>[data-slot=progress-indicator]]:ease-[cubic-bezier(0.16,1,0.3,1)]",
          resetting
            ? "[&>[data-slot=progress-indicator]]:duration-0"
            : "[&>[data-slot=progress-indicator]]:duration-900"
        )}
      />
    </div>
  )
}

function RailConnector({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-10 items-center justify-center lg:h-auto"
    >
      <div className="relative flex h-full w-8 items-center justify-center lg:h-8 lg:w-10">
        <span className="absolute h-8 w-px bg-muted lg:h-px lg:w-8" />
        <span
          className={cn(
            "absolute h-8 w-px origin-top bg-primary transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:h-px lg:w-8 lg:origin-left",
            active
              ? "scale-y-100 lg:scale-x-100"
              : "scale-y-0 lg:scale-x-0 lg:scale-y-100"
          )}
        />
        <ArrowRight className="relative size-4 rotate-90 bg-card text-muted-foreground lg:rotate-0" />
      </div>
    </div>
  )
}

export function ConnectorRail() {
  const { phase, ref } = useSequence(CONNECTOR_STEPS, {
    restartDelay: 1800,
  })
  const shift = SHIFTS[0]
  const normalized = [
    ["worker", shift.worker],
    ["facility", shift.facility],
    ["in", shift.timesheetIn],
    ["out", "17:01"],
    ["hours", shift.hoursPaid.toFixed(2)],
    ["rate", shift.rate.toFixed(2)],
    ["rule", shift.rule],
    ["confidence", "0.94"],
  ] as const

  return (
    <MockFrame
      frameRef={ref}
      title="agent · transfer rail"
      ariaLabel="Animated transfer rail showing synthetic shift 4821 moving from a facility export through normalization and ADP payout to a matching QuickBooks invoice line."
      contentClassName="py-4"
    >
      <div className="grid min-w-0 grid-cols-1 items-stretch lg:grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1.35fr)_auto_minmax(0,0.75fr)_auto_minmax(0,1fr)]">
        <RailNode
          title="Facility PDF / ADP export"
          active={phase >= 1}
          resetting={phase === 0}
        >
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <FileText aria-hidden="true" className="size-4 shrink-0" />
            <div className="grid min-w-0 gap-1">
              <span>Mercy General</span>
              <span className="truncate font-mono text-xs">shift_4821.pdf</span>
            </div>
          </div>
        </RailNode>

        <RailConnector active={phase >= 2} />

        <RailNode
          title="Normalized shift"
          active={phase >= 2}
          resetting={phase === 0}
        >
          <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-[11px] leading-4 tabular-nums">
            {normalized.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{key}:</dt>
                <dd className="min-w-0 truncate text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </RailNode>

        <RailConnector active={phase >= 3} />

        <RailNode
          title="ADP payout"
          active={phase >= 3}
          resetting={phase === 0}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-medium tabular-nums">
              {money(shift.payout)}
            </span>
            <StatusBadge status="paid" />
          </div>
        </RailNode>

        <RailConnector active={phase >= 4} />

        <RailNode
          title="QuickBooks invoice line"
          active={phase >= 4}
          resetting={phase === 0}
        >
          <div className="grid gap-2">
            <span className="font-mono text-xs tabular-nums">
              {shift.hoursPaid.toFixed(2)} h × bill rate
            </span>
            <Badge variant="outline" className="text-muted-foreground">
              matches payout
            </Badge>
          </div>
        </RailNode>
      </div>
    </MockFrame>
  )
}
