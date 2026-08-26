import { Section } from "@/components/section"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const losses = [
  [
    "Overpayments",
    "margin, straight off the P&L",
    "catches them before payout, per shift, with the rule that fired",
  ],
  [
    "Underpayments",
    "legal overhead, mediation, wage-claim exposure",
    "corrects them before the worker notices, with the evidence attached",
  ],
  [
    "Delayed payouts",
    "worker churn — people leave the platform that pays late",
    "decides by the cutoff, every time",
  ],
  [
    "Overpayments you invoiced",
    "customer churn when they audit the bill",
    "the invoice line matches the corrected payout",
  ],
] as const

export function Stakes() {
  return (
    <Section id="stakes" tone="muted" title="Where payroll loses money.">
      <div className="border-y">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[22%] whitespace-normal align-bottom">Loss</TableHead>
              <TableHead className="hidden w-[32%] whitespace-normal align-bottom md:table-cell">What it costs you</TableHead>
              <TableHead className="whitespace-normal align-bottom">What the agent does</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {losses.map(([loss, cost, action]) => (
              <TableRow key={loss}>
                <TableCell className="font-heading font-semibold whitespace-normal align-top">
                  {loss}
                  <span className="mt-1 block font-sans text-sm font-normal text-muted-foreground md:hidden">
                    {cost}
                  </span>
                </TableCell>
                <TableCell className="hidden whitespace-normal align-top text-muted-foreground md:table-cell">
                  {cost}
                </TableCell>
                <TableCell className="whitespace-normal align-top text-muted-foreground">
                  {action}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="font-heading text-lg font-medium">
        Same goal as your payroll person: no financial loss.
      </p>
    </Section>
  )
}
