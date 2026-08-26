import { Section } from "@/components/section"
import { MemoryLedger } from "@/mocks/MemoryLedger"

export function NeverLeaves() {
  return (
    <Section
      id="memory"
      title="It gets smarter every week. And it never leaves."
      lede={
        <p>
          Every quirk of your operation it learns stays learned. If your payroll
          person leaves, the agent doesn't; your context remains with it.
        </p>
      }
    >
      <MemoryLedger />
    </Section>
  )
}
