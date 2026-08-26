import { Section } from "@/components/section"
import { RuleFromSentence } from "@/mocks/RuleFromSentence"
import { RulesPanel } from "@/mocks/RulesPanel"
import { ShiftDesk } from "@/mocks/ShiftDesk"

export function Detective() {
  return (
    <Section
      id="detective"
      tone="muted"
      title="Detective. It spots the discrepancy the second the shift ends."
      lede={
        <p>
          Shift 4821 just ended at Mercy General. The timesheet came in from ADP
          with no clock-out. Watch.
        </p>
      }
    >
      <ShiftDesk />

      <section
        id="rules"
        aria-labelledby="rules-heading"
        className="flex scroll-mt-18 flex-col gap-9 pt-10 md:pt-16"
      >
        <header className="flex max-w-[72ch] flex-col gap-4">
          <h3
            id="rules-heading"
            className="font-heading text-2xl font-semibold tracking-[-0.03em] text-balance sm:text-3xl"
          >
            The rulebook, in plain English.
          </h3>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg">
            Every rule you already apply, written the way you'd say it. The
            agent compiles each one into a deterministic check, an LLM check, or
            both — and tells you which.
          </p>
        </header>
        <RulesPanel />
      </section>

      <section
        aria-labelledby="rule-change-heading"
        className="flex flex-col gap-9 pt-10 md:pt-16"
      >
        <header className="flex max-w-[72ch] flex-col gap-4">
          <h3
            id="rule-change-heading"
            className="font-heading text-2xl font-semibold tracking-[-0.03em] text-balance sm:text-3xl"
          >
            Change the rules in one sentence.
          </h3>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg">
            Things change on the ground. Say it once; it becomes a time-bound
            rule that expires on its own. That malleability is what reality
            looks like.
          </p>
        </header>
        <RuleFromSentence />
      </section>
    </Section>
  )
}
