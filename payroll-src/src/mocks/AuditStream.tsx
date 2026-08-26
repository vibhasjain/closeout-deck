import { MockFrame } from "@/components/mock-frame"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AUDIT_START, SHIFTS, type Shift } from "@/data/shifts"
import { money } from "@/lib/format"
import { useCountUp, useSequence } from "@/lib/useSequence"

const AUDIT_STEPS = [600, 2500, 2500, 2500, 2500, 2500, 2500]

function correctionTotals(shifts: Shift[]) {
  return shifts.reduce(
    (totals, shift) => ({
      under: totals.under + shift.underCorrected,
      over: totals.over + shift.overCorrected,
    }),
    { under: 0, over: 0 }
  )
}

function AuditCounters({
  underTarget,
  overTarget,
  animate,
}: {
  underTarget: number
  overTarget: number
  animate: boolean
}) {
  const underDelta = useCountUp(underTarget, 700, animate)
  const overDelta = useCountUp(overTarget, 700, animate)

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1 rounded-lg border bg-background p-4">
        <div className="text-xs text-muted-foreground">
          Underpayments corrected
        </div>
        <div className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
          <span className="font-mono text-base font-normal">$</span>
          {money(AUDIT_START.under + underDelta).slice(1)}
        </div>
      </div>
      <div className="grid gap-1 rounded-lg border bg-background p-4">
        <div className="text-xs text-muted-foreground">
          Overpayments corrected
        </div>
        <div className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
          <span className="font-mono text-base font-normal">$</span>
          {money(AUDIT_START.over + overDelta).slice(1)}
        </div>
      </div>
    </div>
  )
}

export function AuditStream() {
  const { phase, ref, reduced } = useSequence(AUDIT_STEPS, {
    restartDelay: 3200,
  })
  const rowCount = reduced ? SHIFTS.length : Math.min(phase, SHIFTS.length)
  const inserted = SHIFTS.slice(0, rowCount)
  const rows = inserted.toReversed()
  const totals = correctionTotals(inserted)

  return (
    <MockFrame
      frameRef={ref}
      title="agent · correction audit"
      ariaLabel="Animated audit stream showing six synthetic shifts increasing underpayment and overpayment corrections as evidence-backed payroll decisions arrive."
      contentClassName="grid gap-4 py-4"
    >
      <AuditCounters
        key={rowCount === 0 ? "idle" : "active"}
        underTarget={totals.under}
        overTarget={totals.over}
        animate={!reduced && rowCount > 0}
      />

      <div className="min-h-80 min-w-0 rounded-lg border">
        <Table className="text-xs md:min-w-245">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Shift</TableHead>
              <TableHead className="hidden md:table-cell">Facility</TableHead>
              <TableHead>Discrepancy</TableHead>
              <TableHead className="hidden md:table-cell">
                What the agent did
              </TableHead>
              <TableHead className="text-right">↓ Under</TableHead>
              <TableHead className="text-right">↑ Over</TableHead>
              <TableHead className="hidden md:table-cell">Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((shift) => (
              <TableRow
                key={shift.id}
                className="animate-row-in hover:bg-muted/30"
              >
                <TableCell className="font-mono tabular-nums">
                  {shift.id}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {shift.facility}
                </TableCell>
                <TableCell className="whitespace-normal md:whitespace-nowrap">
                  {shift.discrepancyLabel}
                </TableCell>
                <TableCell className="hidden max-w-64 truncate md:table-cell">
                  {shift.decision}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {money(shift.underCorrected)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {money(shift.overCorrected)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex max-w-80 gap-1 overflow-hidden">
                    {shift.evidence.slice(0, 3).map((item) => (
                      <Badge
                        key={item}
                        variant="outline"
                        className="max-w-32 truncate font-normal text-muted-foreground"
                      >
                        {item}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </MockFrame>
  )
}
