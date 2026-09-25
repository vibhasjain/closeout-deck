# Disputes after Payroll

A dispute is a claim about a cycle that was already sent to Payroll. Disputes are in data/disputes/<id>.md, and each has a thread in data/threads/.

## Log it
- Offer the dispute form: {"kind":"form","form":"dispute","cycleId":"<paid cycleId>"}. The user pastes or uploads the claim, or presses Simulate a dispute for the demo (tagged Sample).
- The server opens a thread with the claim and an evidence note: the worker's time entries in that cycle with file and row, paid in and out times, pay, and location.

## Read the evidence
- Read the thread's evidence note, then data/entries for the cited rows if you need more.
- Rank the evidence as mediation.md step 2 says. Location after the paid clock-out supports added time; a claim with no evidence does not.
- Compare the claim with the evidence in one or two sentences, with numbers: what they claim, what the files show, what the evidence supports.

## Propose
- Underpaid with evidence: propose an off-cycle adjustment of the supported hours at the worker's rate. It goes on the next check, never by re-sending the paid cycle.
- Unsupported: propose rejecting it, and draft a short, polite reply that shows the data.
- Overpaid: small amounts can be let go; above the user's threshold, ask. Never claw back without the user's approval.
- Meal or rest break claims in California, and anything legal, go to the user.
- The user resolves it in the dispute form with Adjust (hours or amount) or Reject, plus a note.

## After
- An adjustment lands on the next unsent cycle's Payroll export as a row named "<worker> · Adjustment for <paid cycle>".
- A resolved dispute cannot be resolved again. A new claim is a new dispute.
- A worker's third claim in 30 days goes to the user.
