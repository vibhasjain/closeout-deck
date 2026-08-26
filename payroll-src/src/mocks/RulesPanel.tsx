import { Fragment, type ReactNode, type RefObject } from "react"

import { MockFrame } from "@/components/mock-frame"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RULES, RULE_SOURCES, type Rule } from "@/data/shifts"
import { useSequence } from "@/lib/useSequence"
import { cn } from "@/lib/utils"

const RULE_STEPS = RULE_SOURCES.flatMap(() => [650, 650, 1100])
const FACILITY_SOURCE_INDEX = RULE_SOURCES.indexOf("Facility")

const HIGHLIGHTS: Partial<Record<string, readonly string[]>> = {
  "LEG-OT-40": ["after 40 hours", "1.5×"],
  "CA-MB-01": ["before the end of the 5th hour", "1-hour premium"],
  "FAC-MERCY-02": ["exact 8:00 clock-outs", "verify with location"],
  "CON-SUTTER-01": ["orientation shifts", "training rate"],
  "VER-HC-01": ["shift-handoff overlap", "15 minutes"],
  "TB-ROUND-7": ["nearest 15 minutes", "within 7 minutes"],
  "CS-01": ["within 10 minutes", "one shift"],
  "TW-1187": ["No overtime", "this week"],
}

const COMPILED_DETAILS: Partial<
  Record<string, { condition: string; effect: string }>
> = {
  "LEG-OT-40": { condition: "week_hours > 40", effect: "pay 1.5×" },
  "CA-MB-01": {
    condition: "meal_start > hour_5",
    effect: "add 1 h premium",
  },
  "FAC-MERCY-02": {
    condition: "clock_span == 8:00",
    effect: "verify location",
  },
  "CON-SUTTER-01": {
    condition: "shift == orientation",
    effect: "invoice $0 · pay training rate",
  },
  "VER-HC-01": {
    condition: "handoff_overlap <= 15m",
    effect: "pay overlap",
  },
  "TB-ROUND-7": {
    condition: "punch_delta <= 7m",
    effect: "round 15m",
  },
  "CS-01": {
    condition: "clock_ins <= 10m apart",
    effect: "merge shifts",
  },
  "TW-1187": {
    condition: "hours > 40",
    effect: "hold for review",
  },
}

function renderRuleText(rule: Rule, highlighted: boolean): ReactNode {
  const matches = (HIGHLIGHTS[rule.id] ?? [])
    .map((phrase) => ({ phrase, index: rule.text.indexOf(phrase) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index)

  if (matches.length === 0) return rule.text

  const nodes: ReactNode[] = []
  let cursor = 0

  for (const { phrase, index } of matches) {
    if (index < cursor) continue
    if (index > cursor) nodes.push(rule.text.slice(cursor, index))
    nodes.push(
      <span
        key={`${rule.id}-${phrase}`}
        className={cn(highlighted && "rounded-sm bg-primary/15 px-0.5")}
      >
        {phrase}
      </span>
    )
    cursor = index + phrase.length
  }

  if (cursor < rule.text.length) nodes.push(rule.text.slice(cursor))
  return nodes
}

function KindBadges({ kind }: { kind: Rule["kind"] }) {
  if (kind === "both") {
    return (
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary">deterministic</Badge>
        <Badge variant="secondary">LLM check</Badge>
      </div>
    )
  }

  return (
    <Badge variant="secondary">
      {kind === "llm" ? "LLM check" : "deterministic"}
    </Badge>
  )
}

function CompiledPanel({ rule }: { rule: Rule }) {
  const detail = COMPILED_DETAILS[rule.id] ?? {
    condition: rule.id,
    effect: `run ${rule.kind} check`,
  }

  return (
    <div className="animate-row-in grid gap-2 rounded-lg border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed sm:grid-cols-2 xl:grid-cols-4">
      <div className="min-w-0 break-words">
        <span className="text-muted-foreground">scope:</span>{" "}
        {rule.scope ?? "all"}
      </div>
      <div className="min-w-0 break-words">
        <span className="text-muted-foreground">condition:</span>{" "}
        {detail.condition}
      </div>
      <div className="min-w-0 break-words">
        <span className="text-muted-foreground">effect:</span> {detail.effect}
      </div>
      <div className="min-w-0 break-words">
        <span className="text-muted-foreground">expires:</span>{" "}
        {rule.expires ?? "never"}
      </div>
    </div>
  )
}

export function RulesPanel() {
  const { phase, ref, reduced } = useSequence(RULE_STEPS, {
    restartDelay: 1100,
  })
  const sourceIndex = reduced
    ? FACILITY_SOURCE_INDEX
    : Math.min(Math.floor(phase / 3), RULE_SOURCES.length - 1)
  const compileStage = reduced ? 2 : phase % 3
  const source = RULE_SOURCES[sourceIndex]
  const rules = RULES.filter((rule) => rule.source === source)

  return (
    <MockFrame
      frameRef={ref as RefObject<HTMLDivElement | null>}
      title="rulebook · compiler"
      ariaLabel="An agent cycles through payroll rule sources and compiles plain-English rules into active checks."
      className="pointer-events-none select-none"
      contentClassName="p-3 sm:p-4"
    >
      <Tabs value={source} className="min-w-0 gap-4">
        <TabsList
          variant="line"
          className="grid h-auto! w-full grid-cols-2 gap-x-1 gap-y-3 sm:grid-cols-4 xl:grid-cols-8"
        >
          {RULE_SOURCES.map((ruleSource) => (
            <TabsTrigger
              key={ruleSource}
              value={ruleSource}
              disabled
              className="w-full py-1 data-disabled:opacity-100"
            >
              {ruleSource}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={source} className="min-w-0">
          <Table className="table-fixed md:min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[46%]">Rule</TableHead>
                <TableHead className="w-[23%]">Compiled as</TableHead>
                <TableHead className="hidden w-[23%] md:table-cell">
                  Scope
                </TableHead>
                <TableHead className="hidden w-[8%] text-right md:table-cell">
                  Active
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule, index) => (
                <Fragment key={rule.id}>
                  <TableRow className={cn(index === 0 && "animate-row-in")}>
                    <TableCell className="align-top whitespace-normal">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {rule.id}
                        </span>
                        <span className="leading-relaxed">
                          {renderRuleText(
                            rule,
                            index === 0 && compileStage === 0 && !reduced
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <KindBadges kind={rule.kind} />
                    </TableCell>
                    <TableCell className="hidden align-top whitespace-normal md:table-cell">
                      <div className="flex flex-col items-start gap-1.5">
                        <span>{rule.scope ?? "all"}</span>
                        {rule.expires ? (
                          <Badge variant="outline">
                            expires {rule.expires}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-right align-top md:table-cell">
                      <Switch
                        aria-label={`${rule.id} active`}
                        checked
                        disabled
                        size="sm"
                        className="pointer-events-none data-disabled:opacity-100"
                      />
                    </TableCell>
                  </TableRow>
                  {index === 0 && compileStage >= 1 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-3 whitespace-normal">
                        <CompiledPanel rule={rule} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </MockFrame>
  )
}
