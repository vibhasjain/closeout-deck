import { Section } from "@/components/section"
import { ChaserThread } from "@/mocks/ChaserThread"

export function Chaser() {
  return (
    <Section
      id="chaser"
      title="Data collector. It asks the humans, then follows up until it's resolved."
      lede={
        <p>
          Shift 4821 needs a manager's word. The agent already has ADP, the
          geofence and the rulebook; it goes and gets the one thing it doesn't
          have — from the person who has it — and decides before the payroll
          cutoff.
        </p>
      }
    >
      <ChaserThread />
    </Section>
  )
}
