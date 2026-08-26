import * as React from "react"
import { CircleCheck, MapPin, TriangleAlert } from "lucide-react"

import { MockFrame } from "@/components/mock-frame"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { CardFooter } from "@/components/ui/card"
import { AUDIT_START, SHIFTS, type Shift } from "@/data/shifts"
import { hhmm, money } from "@/lib/format"
import { useCountUp, useSequence } from "@/lib/useSequence"
import { cn } from "@/lib/utils"

type LogKind =
  | "ended"
  | "timesheet"
  | "flagged"
  | "location"
  | "rules"
  | "human"
  | "decision"
  | "payout"

type LogEvent = {
  kind: LogKind
  shift: Shift
  shiftIndex: number
  offsetSeconds: number
  duration: number
}

const MACHINE_OFFSETS = [0, 1.2, 1.7, 1.1, 1.6, 1.3, 1.8, 1.2]

function buildEvents(): LogEvent[] {
  let elapsed = 0

  return SHIFTS.flatMap((shift, shiftIndex) => {
    const kinds: LogKind[] = [
      "ended",
      "timesheet",
      "flagged",
      "location",
      "rules",
      ...(shift.humanAsked ? (["human"] as const) : []),
      "decision",
      "payout",
    ]

    return kinds.map((kind, index) => {
      elapsed += kind === "human" ? 7 * 60 : (MACHINE_OFFSETS[index] ?? 1.4)
      return {
        kind,
        shift,
        shiftIndex,
        offsetSeconds: elapsed,
        duration: kind === "human" ? 1350 : kind === "payout" ? 1450 : 950,
      }
    })
  })
}

const LIVE_EVENTS = buildEvents()
const LIVE_STEPS = LIVE_EVENTS.map((event) => event.duration)
const LIVE_CLOCK_START = Date.now()
const REDUCED_EVENT_COUNT = LIVE_EVENTS.filter(
  (event) => event.shift.id === "4821"
).length

const SOURCE_BY_SHIFT: Record<string, string> = {
  "4821": "ADP",
  "4822": "Ubeya",
  "4825": "Sutter roster",
  "4826": "ADP",
  "4830": "ADP weekly total",
  "4833": "facility clock",
}

const LIVE_CYCLE_SECONDS =
  LIVE_EVENTS[LIVE_EVENTS.length - 1]?.offsetSeconds ?? 0
const PREVIOUS_SHIFT_EVENTS = LIVE_EVENTS.filter(
  (event) => event.shiftIndex === SHIFTS.length - 1
).map((event) => ({
  ...event,
  offsetSeconds: event.offsetSeconds - LIVE_CYCLE_SECONDS,
}))

function LogMessage({ event }: { event: LogEvent }) {
  const { kind, shift } = event

  if (kind === "ended") {
    return (
      <span>
        shift {shift.id} ended · {shift.facility} · {shift.role} ·{" "}
        {shift.worker}
      </span>
    )
  }

  if (kind === "timesheet") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span>timesheet received</span>
        <Badge variant="outline">{SOURCE_BY_SHIFT[shift.id]}</Badge>
        <span>
          in {shift.timesheetIn} · out {shift.timesheetOut ?? "—"}
        </span>
      </span>
    )
  }

  if (kind === "flagged") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <TriangleAlert
          aria-hidden="true"
          className="size-3.5 shrink-0 text-warning"
        />
        <span>{shift.discrepancyLabel}</span>
        <StatusBadge status="flagged" />
      </span>
    )
  }

  if (kind === "location") {
    const locationLabel =
      shift.id === "4833"
        ? `${shift.locationIn}–${shift.locationOut}`
        : shift.locationIn === "—"
          ? "weekly hours · 43.0"
          : `geofence ${shift.locationIn}–${shift.locationOut}`

    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
        <span>checked location</span>
        <Badge variant="outline">{locationLabel}</Badge>
      </span>
    )
  }

  if (kind === "rules") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span>checked rules</span>
        <Badge variant="outline">{shift.rule}</Badge>
      </span>
    )
  }

  if (kind === "human") {
    if (!shift.humanReply) {
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span>asked {shift.humanAsked}</span>
          <span>· awaiting reply · OT held</span>
          <StatusBadge status="held" />
        </span>
      )
    }

    return (
      <span>
        asked {shift.humanAsked} → reply: “{shift.humanReply}”
      </span>
    )
  }

  if (kind === "decision") {
    return (
      <span className="inline-flex items-start gap-1.5 text-success-foreground">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>{shift.decision}</span>
      </span>
    )
  }

  const delta = shift.underCorrected || shift.overCorrected
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>payout {money(shift.payout)}</span>
      <StatusBadge status={shift.status} />
      {delta > 0 ? (
        <Badge
          variant="outline"
          className="animate-delta-fly border-primary/40 bg-primary/10 font-mono text-primary-foreground tabular-nums"
        >
          $ +{delta.toFixed(2)} {shift.underCorrected > 0 ? "↓" : "↑"}
        </Badge>
      ) : null}
    </span>
  )
}

function CounterValue({ value }: { value: number }) {
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return (
    <div className="font-heading text-xl leading-none font-semibold tracking-tight tabular-nums sm:text-2xl">
      <span className="mr-0.5 font-mono text-[0.72em] font-medium">$</span>
      {formatted}
    </div>
  )
}

function AuditCounters({
  underTarget,
  overTarget,
  animateUnder,
  animateOver,
}: {
  underTarget: number
  overTarget: number
  animateUnder: boolean
  animateOver: boolean
}) {
  const under = useCountUp(underTarget, 700, animateUnder)
  const over = useCountUp(overTarget, 700, animateOver)

  return (
    <CardFooter className="relative grid grid-cols-2 items-start gap-3 rounded-none bg-muted/40">
      <div className="min-w-0 border-r pr-3">
        <div className="mb-2 text-[10px] leading-tight font-medium text-muted-foreground sm:text-xs">
          Underpayments corrected ↓
        </div>
        <CounterValue value={under} />
      </div>
      <div className="min-w-0">
        <div className="mb-2 text-[10px] leading-tight font-medium text-muted-foreground sm:text-xs">
          Overpayments corrected ↑
        </div>
        <CounterValue value={over} />
      </div>
    </CardFooter>
  )
}

export function LiveLog() {
  const { phase, ref, reduced } = useSequence(LIVE_STEPS, {
    restartDelay: 1600,
  })
  const [cycle, setCycle] = React.useState(0)
  const previousPhase = React.useRef(phase)

  React.useEffect(() => {
    if (phase < previousPhase.current) setCycle((current) => current + 1)
    previousPhase.current = phase
  }, [phase])

  const displayPhase = reduced ? REDUCED_EVENT_COUNT - 1 : phase
  const currentEvent = LIVE_EVENTS[displayPhase]
  const currentCycleEvents = LIVE_EVENTS.slice(0, displayPhase + 1)
  const eventsSoFar = [...PREVIOUS_SHIFT_EVENTS, ...currentCycleEvents]
  const visibleEvents = eventsSoFar.slice(-9)
  const completedShiftIndexes = new Set(
    currentCycleEvents
      .filter((event) => event.kind === "payout")
      .map((event) => event.shiftIndex)
  )
  const underTarget =
    AUDIT_START.under +
    SHIFTS.reduce(
      (total, shift, index) =>
        total + (completedShiftIndexes.has(index) ? shift.underCorrected : 0),
      0
    )
  const overTarget =
    AUDIT_START.over +
    SHIFTS.reduce(
      (total, shift, index) =>
        total + (completedShiftIndexes.has(index) ? shift.overCorrected : 0),
      0
    )
  const isActivePayout = !reduced && currentEvent.kind === "payout"
  const currentClock = new Date(
    LIVE_CLOCK_START + currentEvent.offsetSeconds * 1000
  )

  return (
    <MockFrame
      frameRef={ref as React.RefObject<HTMLDivElement | null>}
      title="agent · live"
      ariaLabel="A live payroll agent log catches discrepancies, checks evidence and rules, resolves each shift, and updates corrected-dollar totals."
      live
      meta={
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums sm:text-xs">
          {hhmm(currentClock)}
        </span>
      }
      contentClassName="p-0"
    >
      <div className="flex h-[23.75rem] flex-col justify-end overflow-hidden px-3 py-4 font-mono [mask-image:linear-gradient(to_bottom,transparent,black_2rem)] text-[11px] leading-relaxed sm:px-4 sm:text-[13px]">
        <div className="flex flex-col gap-2.5">
          {visibleEvents.map((event, index) => {
            const eventIndex = eventsSoFar.length - visibleEvents.length + index
            const newest = eventIndex === eventsSoFar.length - 1
            const age = visibleEvents.length - 1 - index
            return (
              <div
                key={`${event.shift.id}-${event.kind}`}
                className={cn(
                  "grid min-w-0 grid-cols-[4.7rem_minmax(0,1fr)] items-start gap-2",
                  newest && "animate-row-in"
                )}
                style={{ opacity: Math.max(0.38, 1 - age * 0.075) }}
              >
                <span className="text-muted-foreground tabular-nums">
                  {hhmm(
                    new Date(LIVE_CLOCK_START + event.offsetSeconds * 1000)
                  )}
                </span>
                <span className="min-w-0 break-words">
                  <LogMessage event={event} />
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <AuditCounters
        key={cycle}
        underTarget={underTarget}
        overTarget={overTarget}
        animateUnder={isActivePayout && currentEvent.shift.underCorrected > 0}
        animateOver={isActivePayout && currentEvent.shift.overCorrected > 0}
      />
    </MockFrame>
  )
}
