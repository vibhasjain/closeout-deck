# Send to Payroll

## When
- Read nextstep.md first. Send is the next step only when all three sets have time entries, every missing time entry was asked about or closed, and every proposed and judgment group has a decision.
- Waiting groups (asked a site or worker, no reply yet) do not block Payroll. Pay what everyone agrees on now; the rest is fixed on the next check (mediation.md, step 6).
- If the user wants to send with open items, name them from nextstep.md. The send form lists them too. Sending anyway is their call, never yours.

## How
- Offer the send form: {"kind":"form","form":"send","cycleId":"<cycleId>"}. The user presses Send to Payroll; you never send it yourself.
- The destination is the Payroll system named in the profile, else Payroll.
- Delivery is simulated. Say "Sent to <destination> · Demo"; never say money moved or a vendor received it.

## What the file contains
- One row per worker: worker, regular_hours, ot_hours, premium_hours, gross, held_entries.
- It comes from the engine run of the cycle: regular and overtime hours, meal and rest premiums, and gross pay.
- Held time entries are excluded from pay and counted in held_entries. Say how many are held and why (data/findings).
- A dismissed proposal removes that rule's own premium from pay. Approved and escalated groups keep the engine's pay.
- Dispute adjustments from an earlier Payroll appear as extra rows named "<worker> · Adjustment for <paid cycle>".

## After
- A cycle is sent once. A second send returns the existing batch. Never suggest re-sending.
- Corrections found after Payroll go on the next check (disputes.md).
- data/batches/<cycleId>.csv is the exact file that was sent. Answer questions about it from that file.
- The cycle shows Paid, and nextstep.md says done for it.
