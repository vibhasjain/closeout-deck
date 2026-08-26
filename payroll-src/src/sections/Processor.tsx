import { Section } from "@/components/section"
import { AuditStream } from "@/mocks/AuditStream"
import { ConnectorRail } from "@/mocks/ConnectorRail"

export function Processor() {
  return (
    <Section
      id="processor"
      tone="muted"
      title="Data processor. It moves the data, pays out, and tells you what it saved."
      lede={
        <p>
          Facility PDF to normalized shift to ADP to the invoice line. Then the
          two numbers, every single shift: dollars of underpayment corrected,
          dollars of overpayment corrected — a live, transparent audit trail
          built for agentic operators, not for humans to tab through.
        </p>
      }
    >
      <div className="flex flex-col gap-8">
        <ConnectorRail />
        <AuditStream />
      </div>
    </Section>
  )
}
