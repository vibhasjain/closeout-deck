import * as React from "react"
import { ArrowRight, CircleCheck, MapPin } from "lucide-react"

import { MockFrame } from "@/components/mock-frame"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SHIFTS, type Shift } from "@/data/shifts"
import { useSequence } from "@/lib/useSequence"
import { cn } from "@/lib/utils"

const SHIFT_DESK_STEPS = [1000, 800, 1800, 250, 250, 250, 1800, 1800]

function getShift(id: string): Shift {
  const shift = SHIFTS.find((candidate) => candidate.id === id)
  if (!shift) throw new Error(`Missing synthetic shift ${id}`)
  return shift
}

const QUEUE_ROWS: Array<{
  shift: Shift
  evidence: string
}> = [
  { shift: getShift("4822"), evidence: "Ubeya · CS-01" },
  { shift: getShift("4825"), evidence: "contract §4.2" },
  { shift: getShift("4826"), evidence: "CA-MB-01" },
  { shift: getShift("4833"), evidence: "door badge" },
]

function NoninteractiveTab({
  value,
  children,
}: {
  value: string
  children: string
}) {
  return (
    <TabsTrigger
      value={value}
      tabIndex={-1}
      aria-disabled="true"
      className="pointer-events-none"
    >
      {children}
    </TabsTrigger>
  )
}

function QueueView({ phase }: { phase: number }) {
  const maria = getShift("4821")
  const flagged = phase >= 2
  const loadingEvidence = phase === 0

  return (
    <div className="animate-in duration-500 fade-in">
      <Table className="md:min-w-[34rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Shift</TableHead>
            <TableHead className="hidden md:table-cell">Worker</TableHead>
            <TableHead className="hidden md:table-cell">Facility</TableHead>
            <TableHead>Evidence</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="animate-row-in bg-warning/5 hover:bg-warning/5">
            <TableCell className="font-mono">{maria.id}</TableCell>
            <TableCell className="hidden md:table-cell">
              {maria.worker}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              {maria.facility}
            </TableCell>
            <TableCell>
              {loadingEvidence ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <span className="text-xs text-muted-foreground">
                  ADP · geofence
                </span>
              )}
            </TableCell>
            <TableCell>
              <div className={cn(flagged && "animate-flip-in")}>
                <StatusBadge
                  status={flagged ? "flagged" : "processing"}
                  label={flagged ? "Clock-out missing" : undefined}
                />
              </div>
            </TableCell>
          </TableRow>
          {QUEUE_ROWS.map(({ shift, evidence }) => (
            <TableRow key={shift.id}>
              <TableCell className="font-mono">{shift.id}</TableCell>
              <TableCell className="hidden md:table-cell">
                {shift.worker}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {shift.facility}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {evidence}
              </TableCell>
              <TableCell>
                <StatusBadge status={shift.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function TimesheetPanel() {
  return (
    <div className="animate-row-in rounded-lg border bg-background p-3">
      <div className="mb-3 text-xs font-medium">Timesheet</div>
      <div className="grid grid-cols-3 gap-3 font-mono text-xs">
        <div>
          <span className="block text-muted-foreground">source</span>
          ADP
        </div>
        <div>
          <span className="block text-muted-foreground">in</span>
          08:58
        </div>
        <div>
          <span className="block text-muted-foreground">out</span>
          <span className="text-warning-foreground">—</span>
        </div>
      </div>
    </div>
  )
}

function LocationPanel() {
  return (
    <div className="animate-row-in rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
        <MapPin aria-hidden="true" className="size-3.5" />
        Location
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center">
        <div className="grid grid-cols-2 gap-3 font-mono text-xs">
          <div>
            <span className="block text-muted-foreground">entered</span>
            08:52
          </div>
          <div>
            <span className="block text-muted-foreground">exited</span>
            17:01:40
          </div>
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 144 64"
          className="h-16 w-full text-muted-foreground"
        >
          <rect
            x="10"
            y="9"
            width="96"
            height="46"
            rx="8"
            fill="none"
            stroke="currentColor"
            strokeDasharray="4 3"
          />
          <text x="20" y="35" className="fill-muted-foreground text-[9px]">
            Mercy General
          </text>
          <path
            d="M38 45 C57 41, 76 38, 91 35 S115 31, 134 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="38" cy="45" r="3.5" className="fill-primary" />
          <circle cx="134" cy="22" r="4" className="fill-primary" />
        </svg>
      </div>
    </div>
  )
}

function RulesEvidencePanel() {
  const rules = [
    ["CA-MB-01", "break taken 12:10"],
    ["TW-1187", "34.0 h this week"],
    ["FAC-MERCY-02", "not an 8:00 clock-out"],
  ]

  return (
    <div className="animate-row-in rounded-lg border bg-background p-3">
      <div className="mb-2 text-xs font-medium">Rules</div>
      <div className="flex flex-col gap-2">
        {rules.map(([id, result], index) => (
          <div
            key={id}
            className="grid grid-cols-[7.4rem_minmax(0,1fr)] gap-2 text-xs"
          >
            <span className="font-mono text-muted-foreground">{id}</span>
            <span className="inline-flex items-start gap-1.5">
              {index < 2 ? (
                <CircleCheck
                  aria-hidden="true"
                  className="mt-px size-3.5 shrink-0 text-success"
                />
              ) : (
                <ArrowRight
                  aria-hidden="true"
                  className="mt-px size-3.5 shrink-0"
                />
              )}
              {result}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProposedDecision() {
  return (
    <div className="animate-row-in rounded-lg border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-[auto_minmax(7rem,1fr)_auto] sm:items-center">
        <div>
          <span className="block text-[10px] font-medium text-muted-foreground">
            Proposed clock-out
          </span>
          <span className="font-mono text-lg font-medium">17:01</span>
        </div>
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>confidence</span>
            <span className="font-mono tabular-nums">94%</span>
          </div>
          <Progress value={94} />
        </div>
        <StatusBadge
          status="awaiting"
          label="Needs manager confirmation → Dana K."
          className="h-auto max-w-full py-1 text-left whitespace-normal"
        />
      </div>
    </div>
  )
}

function EvidenceView({ phase }: { phase: number }) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      {phase >= 3 ? <TimesheetPanel /> : null}
      {phase >= 4 ? <LocationPanel /> : null}
      {phase >= 5 ? <RulesEvidencePanel /> : null}
      {phase >= 6 ? <ProposedDecision /> : null}
    </div>
  )
}

function DecisionView() {
  const passedRules = ["CA-MB-01", "TW-1187", "FAC-MERCY-02"]

  return (
    <div className="flex min-h-72 animate-in flex-col justify-center gap-4 duration-500 fade-in slide-in-from-bottom-2">
      <div className="animate-row-in rounded-lg border bg-muted/40 p-3">
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(7rem,18rem)] sm:items-center">
          <div>
            <span className="block text-[10px] font-medium text-muted-foreground">
              Proposed clock-out
            </span>
            <span className="font-mono text-lg font-medium">17:01</span>
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>confidence</span>
              <span className="font-mono tabular-nums">94%</span>
            </div>
            <Progress value={94} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-medium text-muted-foreground">
            Rules passed
          </span>
          {passedRules.map((rule) => (
            <Badge key={rule} variant="outline" className="font-mono">
              {rule}
            </Badge>
          ))}
        </div>
        <StatusBadge
          status="awaiting"
          label="Needs manager confirmation → Dana K."
          className="mt-3 h-auto max-w-full py-1 text-left whitespace-normal"
        />
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <Badge variant="secondary" className="animate-row-in">
          handed to Data collector
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Badge>
        <p className="max-w-sm text-sm text-muted-foreground italic">
          continues below in the next chapter.
        </p>
      </div>
    </div>
  )
}

export function ShiftDesk() {
  const { phase, ref, reduced } = useSequence(SHIFT_DESK_STEPS, {
    restartDelay: 2200,
  })
  const displayPhase = reduced ? 6 : phase
  const activeTab =
    displayPhase <= 2 ? "queue" : displayPhase <= 6 ? "evidence" : "decision"

  return (
    <MockFrame
      frameRef={ref as React.RefObject<HTMLDivElement | null>}
      title="shift desk · discrepancy 4821"
      ariaLabel="The agent inserts shift 4821 into a payroll queue, finds its missing clock-out, checks timesheet, location, and rules, then proposes a manager-confirmed decision."
      contentClassName="min-h-[27.5rem] overflow-hidden"
    >
      <Tabs value={activeTab} className="min-w-0 select-none">
        <TabsList
          variant="line"
          className="pointer-events-none w-full justify-start"
        >
          <NoninteractiveTab value="queue">Queue</NoninteractiveTab>
          <NoninteractiveTab value="evidence">Evidence</NoninteractiveTab>
          <NoninteractiveTab value="decision">Decision</NoninteractiveTab>
        </TabsList>
        <TabsContent value="queue" className="min-w-0 pt-3">
          <QueueView phase={displayPhase} />
        </TabsContent>
        <TabsContent value="evidence" className="min-w-0 pt-3">
          <EvidenceView phase={displayPhase} />
        </TabsContent>
        <TabsContent value="decision" className="min-w-0 pt-3">
          <DecisionView />
        </TabsContent>
      </Tabs>
    </MockFrame>
  )
}
