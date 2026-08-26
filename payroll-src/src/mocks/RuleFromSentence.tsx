import type { RefObject } from "react"

import logoUrl from "@/assets/logo-small.svg"
import { MockFrame } from "@/components/mock-frame"
import { StatusBadge } from "@/components/status-badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { PEOPLE, RULES, SHIFTS } from "@/data/shifts"
import { useSequence, useTypewriter } from "@/lib/useSequence"
import { cn } from "@/lib/utils"

const RULE_MESSAGE = "No overtime allowed this week at Mercy General please."
const RULE_STEPS = [180, 2400, 350, 350, 350, 350, 350, 350, 800, 800]
function getShift(id: string) {
  const shift = SHIFTS.find((candidate) => candidate.id === id)
  if (!shift) throw new Error(`Shared shift ${id} is required`)
  return shift
}

function getRule(id: string) {
  const rule = RULES.find((candidate) => candidate.id === id)
  if (!rule) throw new Error(`Shared rule ${id} is required`)
  return rule
}

const HELD_SHIFT = getShift("4830")
const TEMPORARY_RULE = getRule("TW-1187")

const RULE_FIELDS = [
  { label: "Rule", value: HELD_SHIFT.rule, mono: true },
  { label: "Scope", value: TEMPORARY_RULE.scope ?? "all", mono: false },
  { label: "Window", value: "Mon Aug 24 – Sun Aug 30", mono: true },
  {
    label: "Effect",
    value: "hours over 40 held for review, not paid",
    mono: false,
  },
  { label: "Compiled as", value: TEMPORARY_RULE.kind, mono: true },
] as const

function AgentAvatar() {
  return (
    <Avatar size="sm">
      <AvatarImage src={logoUrl} alt="" />
      <AvatarFallback>HT</AvatarFallback>
    </Avatar>
  )
}

export function RuleFromSentence() {
  const { phase, ref, reduced } = useSequence(RULE_STEPS, {
    restartDelay: 4000,
  })
  const typedMessage = useTypewriter(RULE_MESSAGE, 34, !reduced && phase === 1)
  const visibleMessage = reduced
    ? RULE_MESSAGE
    : phase === 1
      ? typedMessage
      : phase >= 2
        ? RULE_MESSAGE
        : ""

  return (
    <MockFrame
      frameRef={ref as RefObject<HTMLDivElement | null>}
      title="rule input · compiler"
      ariaLabel="A payroll operator writes one sentence and the agent turns it into a temporary overtime rule that holds a matching shift."
      className="pointer-events-none select-none"
      contentClassName="p-3 sm:p-4"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar size="sm">
            <AvatarFallback>ST</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="text-xs text-muted-foreground">
              {PEOPLE.operator} · payroll ops
            </div>
            <div className="min-h-11 rounded-xl rounded-tl-sm border bg-muted/40 px-3 py-2.5 text-sm leading-relaxed">
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

        {phase >= 2 ? (
          <div className="animate-row-in flex min-w-0 items-start gap-3">
            <AgentAvatar />
            <div className="min-w-0 flex-1 overflow-hidden rounded-xl rounded-tl-sm border bg-background">
              <div className="border-b bg-muted/30 px-3 py-2 text-xs font-medium">
                Rule compiled
              </div>
              <div className="grid min-w-0">
                {RULE_FIELDS.map((field, index) =>
                  phase >= index + 2 ? (
                    <div
                      key={field.label}
                      className="animate-row-in grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-b px-3 py-2.5 text-xs last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]"
                    >
                      <span className="text-muted-foreground">
                        {field.label}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 break-words",
                          field.mono && "font-mono"
                        )}
                      >
                        {field.value}
                      </span>
                    </div>
                  ) : null
                )}
                {phase >= 7 ? (
                  <div className="animate-row-in grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-3 py-2.5 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]">
                    <span className="text-muted-foreground">Status</span>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Switch
                        aria-label="Temporary rule active"
                        checked
                        disabled
                        size="sm"
                        className="pointer-events-none data-disabled:opacity-100"
                      />
                      <Badge variant="outline">expires automatically</Badge>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {phase >= 8 ? (
          <div className="animate-row-in grid min-w-0 gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <span className="font-mono text-xs text-muted-foreground">
              {HELD_SHIFT.id}
            </span>
            <div className="min-w-0">
              <span className="font-medium">{HELD_SHIFT.worker}</span>
              <span className="text-muted-foreground">
                {" "}
                · {HELD_SHIFT.scheduled[1]}
              </span>
            </div>
            <StatusBadge
              key={phase >= 9 ? "held" : "checking"}
              status={phase >= 9 ? "held" : "processing"}
              label={
                phase >= 9
                  ? "3.0 h OT held · TW-1187 · manager notified"
                  : "Checking weekly total"
              }
              className="animate-flip-in h-auto max-w-full justify-start py-1 text-left whitespace-normal sm:justify-center"
            />
          </div>
        ) : null}
      </div>
    </MockFrame>
  )
}
