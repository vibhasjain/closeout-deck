# /bench → Payroll Desk (Timesheets · Reconcile · Payroll · Rules) — 2026-09-08

Plan: ~/.claude/plans/binary-stargazing-perlis.md

- [x] Extract engine → bench/engine.js, catalog → bench/catalog.js; `node bench/engine.js` green
- [x] Engine: makeWeek(opts), dayLabels(), fireCount(), new asserts
- [x] Source 10 logos → logos/ (UKG, Ubeya, Paylocity, 7shifts, Paycom, Deputy, TempWorks, Avionté, Rippling, When I Work), compressed; letter-badge fallback
- [x] index.html: new DOM (4 mains + modal + toast), remove compile/vocab, add CSS
- [x] Data: CYCLES, SOURCES, DESTS, scopeText on rules, CUSTOM
- [x] Timesheets tab renderers + connect modal + upload mock
- [x] Reconcile tab renderers (cycles / worker-grouped sheet / discrepancies) + drawer simplification + deep links
- [x] Payroll tab renderers (pay run / billing / batch aux / send mock)
- [x] Rules tab: strip params/steppers, "Applied N×", Add-rule composer
- [x] Verify: node self-check, dev-browser 1440×900 + 390×844, console clean, treatment census
- [x] Commit, push, confirm live at https://closeoutcopilot.com/bench/

## Review (2026-09-08)
- /bench re-sequenced into Timesheets · Reconcile · Payroll · Rules; engine/rules/payouts unchanged (split into bench/engine.js + bench/catalog.js; self-check 31 asserts green via `node bench/engine.js`).
- Built on the Codex lane (gpt-6-astra, effort ultra, 9 min) from bench/BRIEF.md; one 3-minute fix batch (sheet fit at 1440, proportional logos, cite folded into "Compiled from").
- Verified headless (dev-browser) at 1440×900 and 390×844: no console errors, connect modal flips status, discrepancy → row + drawer + source link, Send to ADP flips to Sent, Add rule → CUST-01 draft.
- Not built (by design): real integrations, LLM compile, billing math, business-value intro screen.
