import { Section } from "@/components/section"
import { Button } from "@/components/ui/button"

export function Close() {
  return (
    <Section
      id="close"
      title="Payroll superpowers. Not a replacement."
      lede="The payroll person stays. They stop being the spreadsheet."
    >
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <a href="#detective">See it catch one</a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="https://closeoutcopilot.com/#pricing">
            Pricing on the homepage
          </a>
        </Button>
      </div>
    </Section>
  )
}
