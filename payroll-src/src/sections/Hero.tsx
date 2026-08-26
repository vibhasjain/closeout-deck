import { ArrowDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LiveLog } from "@/mocks/LiveLog"

export function Hero() {
  return (
    <section id="top" aria-labelledby="top-heading" className="bg-background">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-10 lg:py-28">
        <div className="flex min-w-0 flex-col gap-7 lg:col-span-7">
          <h1
            id="top-heading"
            className="max-w-[13ch] font-heading text-5xl leading-[0.98] font-bold tracking-[-0.03em] text-balance lg:text-6xl"
          >
            Spots every single payroll discrepancy. In real time.
          </h1>
          <p className="max-w-[70ch] text-lg leading-8 text-muted-foreground">
            A payroll operations agent for staffing and gig work. It ingests
            every timesheet and location ping, checks them against your rules,
            chases the people who know, and pays out — with a dollar figure for
            what it just saved you.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="#detective">
                See it catch one
                <ArrowDown data-icon="inline-end" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#thesis">Read the thesis</a>
            </Button>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Built by the team behind Closeout Copilot. Every number on this page
            is synthetic.
          </p>
        </div>
        <div className="min-w-0 lg:col-span-5">
          <LiveLog />
        </div>
      </div>
    </section>
  )
}
