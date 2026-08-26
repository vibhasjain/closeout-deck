import { Section } from "@/components/section"
import { ExcelShuffle } from "@/mocks/ExcelShuffle"

export function Today() {
  return (
    <Section
      id="today"
      tone="muted"
      title="Today it all runs through one spreadsheet."
      lede={
        <p>
          Timekeeping, payroll and the rules live in three different systems. A
          payroll operator moves it between them by hand: download the facility
          report, cross-reference the app punches, check the GPS log, read the
          message thread, make a judgment call, key it into payroll. Fifteen to
          thirty minutes per disputed shift. All of it can be automated — and
          done better than it was ever done by hand.
        </p>
      }
    >
      <ExcelShuffle />
    </Section>
  )
}
