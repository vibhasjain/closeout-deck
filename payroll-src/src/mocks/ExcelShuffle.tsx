import * as React from "react"
import { ArrowRight } from "lucide-react"

import { MockFrame } from "@/components/mock-frame"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PEOPLE, SHIFTS, type Shift } from "@/data/shifts"
import { useSequence, useTypewriter } from "@/lib/useSequence"
import { cn } from "@/lib/utils"

type SourceGroup = {
  title: string
  rows: string[]
}

type SheetRow = {
  sourceGroup: number
  sourceRow: number
  cells: [string, string, string, string, string]
}

const SOURCES: SourceGroup[] = [
  {
    title: "Timekeeping",
    rows: [
      "Facility clock export.xlsx",
      "Paper sign-in sheet (photo)",
      "QR kiosk punches",
      "App clock-ins",
    ],
  },
  {
    title: "Payroll",
    rows: ["ADP hours import", "Gusto contractor run"],
  },
  {
    title: "Rules",
    rows: [
      "Client contract §4.2",
      "CA meal-break memo",
      "This week's email: no OT at Mercy",
    ],
  },
]

function getShift(id: string): Shift {
  const shift = SHIFTS.find((candidate) => candidate.id === id)
  if (!shift) throw new Error(`Missing synthetic shift ${id}`)
  return shift
}

const maria = getShift("4821")
const jamal = getShift("4822")
const priya = getShift("4825")
const luis = getShift("4826")
const aisha = getShift("4830")
const tom = getShift("4833")

const SHEET_ROWS: SheetRow[] = [
  {
    sourceGroup: 0,
    sourceRow: 0,
    cells: [
      maria.id,
      maria.facility.split(" ")[0],
      maria.timesheetIn,
      maria.timesheetOut ?? "—",
      "review",
    ],
  },
  {
    sourceGroup: 1,
    sourceRow: 0,
    cells: [
      jamal.id,
      jamal.facility.split(" ")[0],
      jamal.timesheetIn.split(" ")[0],
      jamal.timesheetOut ?? "—",
      "duplicate",
    ],
  },
  {
    sourceGroup: 2,
    sourceRow: 0,
    cells: [
      priya.id,
      priya.facility.split(" ")[0],
      priya.timesheetIn,
      priya.timesheetOut ?? "—",
      "training",
    ],
  },
  {
    sourceGroup: 0,
    sourceRow: 1,
    cells: [
      luis.id,
      luis.facility.split(" ")[0],
      luis.timesheetIn,
      luis.timesheetOut ?? "—",
      "meal",
    ],
  },
  {
    sourceGroup: 2,
    sourceRow: 1,
    cells: [
      aisha.id,
      aisha.facility.split(" ")[0],
      aisha.scheduled[1],
      aisha.status,
      "OT",
    ],
  },
  {
    sourceGroup: 2,
    sourceRow: 2,
    cells: [
      tom.id,
      tom.facility.split(" ")[0],
      tom.timesheetIn,
      tom.locationOut.replace("badge ", ""),
      "badge",
    ],
  },
]

const EXCEL_STEPS = [500, 1600, 1600, 1600, 1600, 1600, 1600]

function TypedSheetRow({
  row,
  active,
  complete,
}: {
  row: SheetRow
  active: boolean
  complete: boolean
}) {
  const a = useTypewriter(row.cells[0], 22, active)
  const b = useTypewriter(row.cells[1], 22, active)
  const c = useTypewriter(row.cells[2], 22, active)
  const d = useTypewriter(row.cells[3], 22, active)
  const e = useTypewriter(row.cells[4], 22, active)
  const typed = [a, b, c, d, e]

  return (
    <TableRow className={cn(active && "animate-row-in bg-primary/5")}>
      {row.cells.map((cell, index) => (
        <TableCell
          key={`${cell}-${index}`}
          className={cn(
            "h-9 border-r border-b p-1.5 font-mono text-[11px] last:border-r-0",
            index >= 3 && "hidden sm:table-cell"
          )}
        >
          {complete ? cell : active ? typed[index] : ""}
          {active && index === 4 ? (
            <span
              aria-hidden="true"
              className="ml-px inline-block h-3 w-px animate-caret-blink bg-foreground align-middle"
            />
          ) : null}
        </TableCell>
      ))}
    </TableRow>
  )
}

export function ExcelShuffle() {
  const { phase, ref, reduced } = useSequence(EXCEL_STEPS, {
    restartDelay: 1400,
  })
  const displayPhase = reduced ? SHEET_ROWS.length : phase
  const activeIndex = displayPhase - 1
  const activeRow = SHEET_ROWS[activeIndex]

  return (
    <MockFrame
      frameRef={ref as React.RefObject<HTMLDivElement | null>}
      title="manual payroll desk"
      ariaLabel="A payroll operator repeatedly moves timekeeping, payroll, and rule records into one spreadsheet by hand."
      caption="15–30 min per disputed shift"
    >
      <div className="grid min-w-0 items-center gap-4 lg:grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1.15fr)]">
        <div className="grid min-w-0 gap-2 sm:grid-cols-3">
          {SOURCES.map((source, groupIndex) => (
            <div
              key={source.title}
              className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background p-4"
            >
              <h4 className="font-heading text-sm font-medium text-foreground">
                {source.title}
              </h4>
              <div className="flex min-w-0 flex-col gap-1">
                {source.rows.map((row, rowIndex) => {
                  const highlighted =
                    activeRow?.sourceGroup === groupIndex &&
                    activeRow.sourceRow === rowIndex
                  return (
                    <div
                      key={row}
                      className={cn(
                        "min-w-0 rounded-md px-2 py-1.5 text-[11px] leading-tight transition-[transform,opacity,background-color] duration-300",
                        highlighted
                          ? "animate-row-in -translate-y-0.5 bg-warning/10 text-warning-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      <span className="block truncate">{row}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
          {activeRow ? (
            <Badge variant="outline" className="animate-row-in font-mono">
              row {activeIndex + 1}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="font-mono text-muted-foreground"
            >
              waiting
            </Badge>
          )}
          <ArrowRight
            aria-hidden="true"
            className="size-5 rotate-90 lg:rotate-0"
          />
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_4.5rem] items-end gap-3">
          <div className="min-w-0 overflow-hidden rounded-lg border bg-background">
            <Table className="table-fixed sm:min-w-[28rem]">
              <TableHeader>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  {["A", "B", "C", "D", "E"].map((heading, index) => (
                    <TableHead
                      key={heading}
                      className={cn(
                        "h-8 border-r p-1.5 text-center font-mono text-[10px] text-muted-foreground last:border-r-0",
                        index >= 3 && "hidden sm:table-cell"
                      )}
                    >
                      {heading}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {SHEET_ROWS.map((row, index) => (
                  <TypedSheetRow
                    key={row.cells[0]}
                    row={row}
                    active={!reduced && index === activeIndex}
                    complete={reduced || index < activeIndex}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex min-w-0 flex-col items-center gap-2 text-center">
            <Avatar size="lg">
              <AvatarFallback>ST</AvatarFallback>
            </Avatar>
            <div className="text-[10px] leading-tight text-muted-foreground">
              <span className="block font-medium text-foreground">
                {PEOPLE.operator}
              </span>
              payroll ops
            </div>
          </div>
        </div>
      </div>
    </MockFrame>
  )
}
