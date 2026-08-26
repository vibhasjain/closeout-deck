import type { RefObject } from "react"

import logoUrl from "@/assets/logo-small.svg"
import { MockFrame } from "@/components/mock-frame"
import { StatusBadge } from "@/components/status-badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PEOPLE, SHIFTS } from "@/data/shifts"
import { useSequence, useTypewriter } from "@/lib/useSequence"

const CHASER_STEPS = [180, 2600, 800, 700, 700, 900]
const FIRST_MESSAGE =
  "Hi Dana — Maria R.'s shift at Mercy today has no clock-out. Location shows she left at 5:01 pm. Can you confirm she worked until 5?"
const AGENT_REPLY = "Thanks. Recording 17:01 and paying out."
const SOURCES = [
  "API · ADP",
  "Browser · Ubeya",
  "Email · facility PDF",
  "Photo · paper sheet",
  "SMS · manager",
] as const

function getShift(id: string) {
  const shift = SHIFTS.find((candidate) => candidate.id === id)
  if (!shift) throw new Error(`Shared follow-up shift ${id} is required`)
  return shift
}

const MARIA_SHIFT = getShift("4821")
const HELD_SHIFT = getShift("4830")
const BAYVIEW_SHIFT = getShift("4833")
const MARIA_REPLY = MARIA_SHIFT.humanReply

if (!MARIA_REPLY) throw new Error("Shift 4821 requires a manager reply")

function AgentAvatar() {
  return (
    <Avatar size="sm">
      <AvatarImage src={logoUrl} alt="" />
      <AvatarFallback>HT</AvatarFallback>
    </Avatar>
  )
}

export function ChaserThread() {
  const { phase, ref, reduced } = useSequence(CHASER_STEPS, {
    restartDelay: 3200,
  })
  const typedMessage = useTypewriter(FIRST_MESSAGE, 58, !reduced && phase === 1)
  const visibleMessage = reduced
    ? FIRST_MESSAGE
    : phase === 1
      ? typedMessage
      : phase >= 2
        ? FIRST_MESSAGE
        : ""
  const replyArrived = phase >= 3
  const agentResolved = phase >= 4
  const movedToResolved = phase >= 5
  const minutesLeft = replyArrived ? 11 : 18

  return (
    <MockFrame
      frameRef={ref as RefObject<HTMLDivElement | null>}
      title="follow-ups · payroll cutoff"
      ariaLabel="An agent messages a supervisor about Maria's missing clock-out, receives confirmation seven minutes later, and resolves the shift before cutoff."
      className="pointer-events-none select-none"
      contentClassName="p-3 sm:p-4"
    >
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]">
        <div className="flex min-w-0 flex-col gap-4 rounded-lg border bg-muted/15 p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Open follow-ups</h3>
            <Badge variant="secondary">{movedToResolved ? 2 : 3} open</Badge>
          </div>

          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[4.25rem] px-1.5">Shift</TableHead>
                <TableHead className="w-[5.25rem] px-1.5">Person</TableHead>
                <TableHead className="px-1.5">Follow-up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!movedToResolved ? (
                <TableRow>
                  <TableCell className="px-1.5 font-mono text-xs">
                    {MARIA_SHIFT.id}
                  </TableCell>
                  <TableCell className="px-1.5 whitespace-normal">
                    {PEOPLE.dana}
                  </TableCell>
                  <TableCell className="px-1.5 whitespace-normal">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-1 text-[11px]">
                        <span>decide by 18:00</span>
                        <span className="font-mono text-muted-foreground">
                          {minutesLeft} min left
                        </span>
                      </div>
                      <Progress
                        value={replyArrived ? 37 : 60}
                        aria-label={`${minutesLeft} minutes until payroll cutoff`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
              <TableRow>
                <TableCell className="px-1.5 font-mono text-xs">
                  {HELD_SHIFT.id}
                </TableCell>
                <TableCell className="px-1.5 whitespace-normal">
                  {PEOPLE.dana}
                </TableCell>
                <TableCell className="px-1.5 text-xs whitespace-normal text-muted-foreground">
                  OT confirmation
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="px-1.5 font-mono text-xs">
                  {BAYVIEW_SHIFT.id}
                </TableCell>
                <TableCell className="px-1.5 whitespace-normal">
                  {PEOPLE.ray}
                </TableCell>
                <TableCell className="px-1.5 text-xs whitespace-normal text-muted-foreground">
                  badge time
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="flex min-w-0 flex-col gap-2 border-t pt-3">
            <h3 className="text-sm font-medium">Resolved</h3>
            {movedToResolved ? (
              <div className="animate-row-in flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2.5 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-muted-foreground">
                    {MARIA_SHIFT.id}
                  </span>
                  <span className="truncate">17:01 confirmed</span>
                </div>
                <StatusBadge status="resolved" />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Nothing resolved yet — waiting on {PEOPLE.dana}.
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 rounded-lg border bg-background p-3 sm:p-4">
          <div
            key={phase === 0 ? "sources-start" : "sources-running"}
            className="relative flex min-w-0 flex-wrap gap-1.5 overflow-hidden rounded-lg border bg-muted/20 p-2.5"
          >
            <span
              aria-hidden="true"
              className="animate-shimmer absolute inset-y-0 left-0 w-1/3 bg-primary/15"
            />
            {SOURCES.map((source) => (
              <Badge
                key={source}
                variant="outline"
                className="bg-background text-[11px] font-normal"
              >
                {source}
              </Badge>
            ))}
          </div>

          <div className="flex min-h-[25rem] min-w-0 flex-col gap-4">
            <div className="flex min-w-0 items-start gap-2.5">
              <AgentAvatar />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>Agent → {PEOPLE.dana} · SMS</span>
                  <span className="font-mono">17:42</span>
                </div>
                <div className="min-h-16 rounded-xl rounded-tl-sm border bg-muted/30 px-3 py-2.5 text-sm leading-relaxed break-words">
                  {visibleMessage}
                  {!reduced && phase <= 1 ? (
                    <span
                      aria-hidden="true"
                      className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-caret-blink bg-foreground"
                    />
                  ) : null}
                </div>
              </div>
            </div>

            {replyArrived ? (
              <div className="animate-row-in ml-5 flex min-w-0 items-start justify-end gap-2.5 sm:ml-12">
                <div className="flex max-w-[31rem] min-w-0 flex-col items-end gap-1.5">
                  <div className="flex flex-wrap items-baseline justify-end gap-2 text-[11px] text-muted-foreground">
                    <span>{PEOPLE.dana} · SMS</span>
                    <span className="font-mono">17:49</span>
                  </div>
                  <div className="rounded-xl rounded-tr-sm border bg-secondary px-3 py-2.5 text-sm leading-relaxed break-words">
                    {MARIA_REPLY}
                  </div>
                </div>
                <Avatar size="sm">
                  <AvatarFallback>DK</AvatarFallback>
                </Avatar>
              </div>
            ) : null}

            {agentResolved ? (
              <div className="animate-row-in flex min-w-0 items-start gap-2.5">
                <AgentAvatar />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-baseline gap-2 text-[11px] text-muted-foreground">
                    <span>Agent → {PEOPLE.dana} · SMS</span>
                    <span className="font-mono">17:49</span>
                  </div>
                  <div className="rounded-xl rounded-tl-sm border bg-muted/30 px-3 py-2.5 text-sm leading-relaxed break-words">
                    {AGENT_REPLY}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </MockFrame>
  )
}
