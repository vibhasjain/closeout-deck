import { ArrowRight } from "lucide-react"

import { Section } from "@/components/section"

const thesisSteps = [
  "Rules in plain English, from anywhere",
  "Compiled: deterministic + LLM checks",
  "Confidence that it knows your operation",
] as const

export function Thesis() {
  return (
    <Section id="thesis" tone="muted" title="Why a specialist wins.">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start">
        <div className="flex max-w-[65ch] flex-col gap-6 text-lg leading-8">
          <p>
            There will be many general-purpose agents. A payroll-ops agent
            fine-tuned for gig work will win their confidence.
          </p>
          <p>
            The place to land first is where the detective work starts:
            accepting discrepancy rules in natural language from many sources
            and programming them into a combination of deterministic and
            LLM-based checks. Not everything thrown into a context window. An
            algorithm that builds the customer's confidence that it is
            intimately familiar with their workflow — that is what wins the
            market.
          </p>
          <p>
            HyperTrack's job is to be the leading payroll operations AI in
            staffing and gig work.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-1 items-center gap-3">
            {thesisSteps.map((step, index) => (
              <div key={step} className="contents">
                <div className="flex items-center rounded-lg border bg-background px-5 py-4 font-heading leading-6 font-medium">
                  {step}
                </div>
                {index < thesisSteps.length - 1 ? (
                  <ArrowRight
                    aria-hidden="true"
                    className="mx-auto size-4 rotate-90 text-muted-foreground"
                  />
                ) : null}
              </div>
            ))}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Grown out of Closeout Copilot — the same evidence engine (customer
            systems, time tracking, location intelligence), pointed at payroll
            operations.
          </p>
        </div>
      </div>
    </Section>
  )
}
