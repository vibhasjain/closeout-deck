import { ArrowRight } from "lucide-react"

import { Section } from "@/components/section"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const jobs = [
  {
    title: "Detective",
    body: "Spots discrepancies by holding every shift against the rulebook: legal, state, facility, contract, vertical, time-based, common sense, and whatever changed this week.",
    href: "#detective",
  },
  {
    title: "Data collector & human chaser",
    body: "Pulls timesheets and location from every source, asks humans for what's missing, follows up until it's resolved, decides by the deadline.",
    href: "#chaser",
  },
  {
    title: "Data processor",
    body: "Moves the result between platforms and formats and initiates the payout.",
    href: "#processor",
  },
] as const

export function ThreeJobs() {
  return (
    <Section
      id="jobs"
      title="Your payroll person does three jobs."
      lede={
        <p>
          We interviewed payroll operations people. Strip away the tools and
          their week is three jobs. Their goal is one sentence: the business
          suffers no financial loss — not from overpayments, not from worker
          churn, not from legal blowback. The agent works for the same sentence.
        </p>
      }
    >
      <div className="grid border-y md:grid-cols-3">
        {jobs.map((job, index) => (
          <article
            key={job.title}
            className={cn(
              "flex min-w-0 flex-col gap-5 py-8 md:px-8 md:first:pl-0 md:last:pr-0",
              index > 0 && "border-t md:border-t-0 md:border-l"
            )}
          >
            <h3 className="font-heading text-xl font-semibold tracking-[-0.02em]">
              {job.title}
            </h3>
            <p className="max-w-[42ch] flex-1 leading-7 text-muted-foreground">
              {job.body}
            </p>
            <Button
              asChild
              variant="link"
              className="h-auto w-fit px-0 text-success hover:text-success"
            >
              <a href={job.href}>
                Watch the agent do it
                <ArrowRight data-icon="inline-end" />
              </a>
            </Button>
          </article>
        ))}
      </div>
    </Section>
  )
}
