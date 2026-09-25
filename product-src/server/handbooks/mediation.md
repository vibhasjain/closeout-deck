# Mediation

Follow these steps for every discrepancy and every missing time entry. Threads are in data/threads/<id>.md.

## 0. Intake
- Open a case for every set 1 vs set 2 vs set 3 mismatch you find, before anyone complains. Tie it to a time entry and a cycle.
- Disputes after Payroll are normal. They follow disputes.md.

## 1. Triage
- Name the case type: missed or late punch, AM/PM error, missed clock-out, late clock-out, no-show, meal break, overtime across clients, wrong earning code, leave.
- Fix it yourself only when a saved tolerance rule covers it and it is inside the authority limit in payroll-profile.json. Never apply a tolerance in California.
- When authorityConfigured is false, ask before every fix and every contact.

## 2. Evidence, in rank order
- Location (set 3), then the client's clock (set 2), then a signed sheet, then the worker's report (set 1), then the schedule.
- For firms that trust the client's clock more, lead with set 2 and use location as backup. Use the order this firm confirmed.
- Cite the file and row for every claim. Never invent evidence or replies.

## 3. Who decides
- The client's approval usually stands. Never cut a worker below what they reported without evidence and the user's approval.
- Push back on an unfounded claim with the data, politely.

## 4. Ask
- Ask the site first: one batched note per client with the evidence. Ask the worker only if the site's answer is short of what they reported.
- A missing entry with location evidence goes to the site supervisor; without it, ask the worker whether they worked.
- Never contact anyone on the never-contact list. The gaps form shows them as Never Contact and the server skips them.
- Offer the gaps form to ask: {"kind":"form","form":"gaps","cycleId":"<cycleId>"}. The user presses Ask.
- Draft short, specific questions: the day, the times on file, what the evidence shows and why it matters.

## 5. Chase to the Payroll cutoff
- Nudge once each business day. After 3 unanswered tries, bring it to the user.

## 6. Close at cutoff
- Default: pay the hours both sides agree on and carry the disputed gap to the next check. Holding a line is the user's choice.

## 7. After Payroll
- Underpaid: fix it on the next check. Overpaid: small amounts can be let go; ask above the user's threshold.

## 8. Escalate, never decide
- California meal and rest breaks, anything legal, anything above the authority limit, and a worker's third claim in 30 days.

## 9. Record
- Every message, decision and reason is kept on the thread. A user override becomes a remembered decision from this cycle forward. Paid history is never rewritten.

## This app
- Sending is simulated. Outgoing messages are logged as Not Sent · Demo. Never claim a text or email was delivered.
- The operator records replies with Record reply; treat those as the counterparty's words.
- Approve, dismiss (with a reason) or escalate a whole group with the approve, dismiss and escalate controls, or with the approve and dismiss actions.
