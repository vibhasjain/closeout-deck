import { TrendingUp } from "lucide-react"

import { Section } from "@/components/section"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

const audiences = [
  {
    title: "Marketplace staffing vendors",
    detail:
      "Every client exports time differently, while the marketplace still owns the payout deadline.",
  },
  {
    title: "Staffing buyers",
    qualifier: "MSPs and enterprises running vendor programs",
    detail:
      "Vendor hours, facility evidence and invoice lines arrive in formats that do not agree.",
  },
  {
    title: "Gig-work providers with their own workforce",
    qualifier: "no marketplace in between",
    detail:
      "A lean operations team has to reconcile app activity, local rules and payroll at platform speed.",
  },
] as const

export function WhoWhyNow() {
  return (
    <Section
      id="who"
      title="Every kind of staffing company. Sooner than it feels."
    >
      <div className="grid border-y md:grid-cols-3">
        {audiences.map((audience, index) => (
          <article
            key={audience.title}
            className={cn(
              "flex flex-col gap-4 py-8 md:px-8 md:first:pl-0 md:last:pr-0",
              index > 0 && "border-t md:border-t-0 md:border-l"
            )}
          >
            <h3 className="font-heading text-xl font-semibold tracking-[-0.02em]">
              {audience.title}
            </h3>
            {"qualifier" in audience ? (
              <p className="text-sm text-muted-foreground">
                ({audience.qualifier})
              </p>
            ) : null}
            <p className="max-w-[42ch] leading-7 text-muted-foreground">
              {audience.detail}
            </p>
          </article>
        ))}
      </div>

      <Alert className="max-w-4xl bg-card p-5">
        <TrendingUp />
        <AlertTitle className="font-heading text-base">
          For the CFO and the CEO
        </AlertTitle>
        <AlertDescription className="max-w-[70ch] leading-6">
          There's an imperative to buy AI or get left behind, and enough
          foresight to see that manual payroll operations is going away — even
          where it isn't a burning problem today.
        </AlertDescription>
      </Alert>
    </Section>
  )
}
