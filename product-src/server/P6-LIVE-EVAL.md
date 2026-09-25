# P6 server verification and live onboarding eval

Run date: 2026-09-25. Local Claude Code 2.1.282, server model alias `opus`. These are actual local HTTP/SSE conversations with the Claude CLI, not mocks or fixtures.

## Result

- All server checks pass: `npm --prefix product-src/server test` (132 tests), `npm --prefix product-src/server run typecheck`.
- Email onboarding completed in 7 turns; Fieldglass onboarding completed in 5. All seven coverage topics received `cover_topic`. Each reply contained exactly one valid-shaped card.
- After the calendar plus email answer, the agent asked how client-approved hours arrive and emitted a `chips` card for `clientHours`. After the calendar plus Fieldglass answer, it asked where rates/client rules live and emitted a different `chips` card for `rates`. The question, topic, options and extracted profile differ.
- Both emitted `onboard_complete` without a client-selected turn count or scripted question list. Both persisted explicit ask-first authority through `set_authority`, and emitted `never_contact` for Jordan Smith.
- Independent validation loaded the actual frontend `parseCards`, `parseActions`, `isCard`, `isAction` and `applyAction` through Vite: all 12 cards and 41 actions validated and applied. Each resulting store covered all seven topics exactly once, saved Jordan Smith to `neverContact`, and disabled autonomous fixes/contact. Every question had one question mark and at most 200 visible characters; no malformed fences were silently discarded.
- Subsequent ordinary `mode:chat` requests retained the onboarding facts and the exact same per-user CLI session IDs.
- Real guarded HTTPS fetch of example.com succeeded (559 bytes). Real `POST /firm {domain:"example.com"}` invoked no-tools extraction and returned HTTP 200, `staffing:false`, no invented facts, and domain as the display-name fallback. A read against the existing Supabase `closeout_firm_reads` table succeeded. Cache query/upsert and shape/freshness behavior are also covered by unit tests.

## Commands and isolation

Two local servers used separate ignored `.data` workspace directories to isolate the two histories while authenticating as the requested `dev@hypertrack.io`. Each server shared its one per-user CLI session across onboarding and ordinary chat. The dev-only session secret was supplied locally and is omitted here. Supabase settings were blanked for these eval servers so no existing account state or sample data was changed. The client context was updated from returned profile/coverage actions between requests. Canonical state syncing is tested separately by the client and server suites.

```sh
CLOSEOUT_DEV_EMAIL=dev@hypertrack.io NODE_ENV=development \
CLOSEOUT_DATA_DIR="$PWD/product-src/server/.data/p6-email-final" PORT=8796 \
SUPABASE_URL= SUPABASE_SERVICE_KEY= SESSION_SECRET='<local-only secret>' \
npm --prefix product-src/server run dev

CLOSEOUT_DEV_EMAIL=dev@hypertrack.io NODE_ENV=development \
CLOSEOUT_DATA_DIR="$PWD/product-src/server/.data/p6-fieldglass-final" PORT=8797 \
SUPABASE_URL= SUPABASE_SERVICE_KEY= SESSION_SECRET='<local-only secret>' \
npm --prefix product-src/server run dev

node product-src/server/eval/onboard.mjs
npm --prefix product-src/server test
npm --prefix product-src/server run typecheck
```

The initial server CLI call failed with “OAuth session expired and could not be refreshed.” Isolated comparisons showed normal inherited CLI execution worked, adding only `USER` to the sanitized environment restored success, and adding only `LOGNAME` or `SHELL` did not. The server now forwards `USER` for macOS keychain account selection. It still strips server secrets, bridge credentials and arbitrary environment variables; the existing exclusion assertions remain. No reauthentication or token copying was necessary.

The ordinary chat follow-up below proves session memory while the eval's deliberately isolated canonical state remains empty. Its email reply mentioned an internal workspace filename; a final ordinary-chat prompt instruction now keeps internal filenames out of user copy. That prose-only instruction was not rerun in the live eval; onboarding transcripts below are from the final onboarding prompt.

An initial exploratory eval exposed verbose prose, a calendar offset mistake and misuse of source sets for contracts/complaints. The server prompt was tightened, then the full conversations below were rerun in fresh sessions. The final calendar correctly emits `deadlineDays:2` for Wednesday closing before Friday payday, and source records remain limited to the three time-data sets.

## API contract

- `POST /chat` accepts `{mode:"onboard",message,context:{firm,profile,covered}}` with the existing SSE contract. It uses the same queue, workspace, persisted CLI session and resume behavior as chat.
- Authenticated `POST /firm` accepts `{domain:"acmestaffing.com"}` (or an HTTPS URL), returning `{firm,cached}`. Firm contains `domain,name,summary,states,verticals,clientTypes,size,staffing`, plus optional `icon` from a same-origin apple-touch-icon. `{domain:"sample"}` returns fixed sample facts without fetching.
- Firm lookups limit each user to 10/hour, use a seven-day cache, accept HTTPS only, reject IPs/ports/private host suffixes, validate and pin public DNS addresses, recheck up to three redirects, cap each HTML page at 300 KiB/6 seconds, and fetch at most homepage plus one about/locations page.
- `CLOSEOUT_ONBOARD_TIMEOUT_MS` and `CLOSEOUT_FIRM_TIMEOUT_MS` override defaults of 180 seconds and 60 seconds respectively.

IPv6 guards use the [IANA special-purpose registry](https://www.iana.org/assignments/iana-ipv6-special-registry/) and the [RFC 9637 documentation prefix](https://www.rfc-editor.org/rfc/rfc9637.html). Public `2001:4860::` addresses are accepted, including alongside a public IPv4 DNS answer; the rejection is limited to protocol `2001::/23`, documentation `2001:db8::/32` and `3fff::/20`, 6to4 `2002::/16`, and non-global mapped/private/local space. Boundary tests cover both sides of the protocol and documentation ranges.

## Deviations and reasons

- The brief calls Rulebook the first writer of authority while also requiring onboarding `set_authority`. Explicit user authority answers write immediately; only unconfirmed suggestions wait for the Rulebook. Otherwise an explicit “ask me first” could leave pre-existing permissive defaults active. Rulebook is still the manual settings editor.
- Local development without Supabase uses an in-memory firm cache; production requires the existing Supabase table. This follows the server’s existing local-data pattern and keeps the live eval isolated.
- Unknown extracted firm names stay empty in the shape guard and use the submitted domain in the response. This supports valid non-staffing/unknown sites without inventing a business name.

## File-by-file server changes

- `src/validation.ts`: adds the onboard mode.
- `src/prompts.ts`: server-owned adaptive onboarding instructions, precise card/action formats, and profile actions in ordinary chat.
- `prompts/onboard-evidence.md`: seven goal-specific research distributions, defaults and safeguards; no question script.
- `src/firm.ts`: URL/DNS/redirect guards, pinned HTTPS fetch, limits, facts extraction/validation, apple icon detection, sample, cache and rate limit.
- `src/index.ts`: authenticated firm endpoint, onboard prompt routing and explicit per-mode timeout table.
- `src/claude.ts`: forwards only the additional OS `USER` identity required by local keychain lookup.
- `src/workspace.ts`: materializes persistent `payroll-profile.json` and points later chat to it.
- `test/firm.test.ts`: URL/private-IP/redirect/size/type/timeout, facts, no-tools args, page selection, sample/cache and rate-limit tests.
- `test/http.test.ts`: onboard SSE/shared-workspace behavior, firm auth/validation/sample/rate-limit behavior and timeout assertions; only replaces assertions for the now-implemented firm stub.
- `test/claude.test.ts`: preserves secret-exclusion assertions and includes `USER` in the exact allowlist.
- `test/workspace.materialize.test.ts`: saved profile and never-contact recovery evidence.
- `eval/onboard.mjs`: manual two-history live HTTP eval runner.
- `P6-LIVE-EVAL.md`: this report with full transcripts.

## Complete transcripts

### Email source

CLI session: `60c1780b-c74b-4145-abc8-df8e3131b039`. Stable across 7 onboarding turns and subsequent chat.

#### Turn 1

**User:** Start onboarding

**Agent (verbatim, including protocol):**

Do you run Payroll weekly, with the period ending Sunday, time entries due Monday, and payday Friday?

```card
{"kind":"question","input":"calendar","topics":["calendar"],"placeholder":"Tell me your pay period, hours cutoff, Payroll deadline and payday"}
```

#### Turn 2

**User:** We run weekly Payroll: Sunday week end, hours due Monday, Payroll closes Wednesday and payday Friday. We get timesheets by email. Workers email photos to our Payroll inbox; I can forward them every Monday.

**Agent (verbatim, including protocol):**

How do clients send back their approved hours, and how many days after Sunday do they usually show up?

```card
{"kind":"question","input":"chips","chips":["Client portal or VMS","Signed sheet or photo","Emailed spreadsheet or PDF","Supervisor email or call","Approve in our app","Only at invoicing"],"topics":["clientHours"]}
```

```action
{"type":"set_calendar","patch":{"frequency":"Weekly","periodEndDay":"Sunday","payDay":"Friday","cutoffDays":1,"deadlineDays":2}}
```

```action
{"type":"cover_topic","topic":"calendar"}
```

```action
{"type":"set_profile","field":"workerHours","value":{"how":"Workers email photos of their time entries to the Payroll inbox","access":"Team forwards them to Closeout Agent every Monday","expected":"Monday, the day after the Sunday week end"}}
```

```action
{"type":"add_source","set":1,"kind":"email","label":"Worker photos from the Payroll inbox","how":"Forwarded by the team every Monday"}
```

```action
{"type":"cover_topic","topic":"workerHours"}
```

#### Turn 3

**User:** Site supervisors email an approved spreadsheet each Monday. I can forward those approved hours to you along with the worker reports.

**Agent (verbatim, including protocol):**

When a worker's photo and the supervisor's spreadsheet don't match, whose hours do you usually pay?

```card
{"kind":"question","input":"chips","chips":["Client-approved hours","Compare both and ask","Worker-reported hours","Varies by client","Check location evidence"],"topics":["whoseHours"]}
```

```action
{"type":"set_profile","field":"clientHours","value":{"how":"Site supervisors email an approved spreadsheet","access":"Team forwards them to Closeout Agent with the worker reports","expected":"Monday, the day after the Sunday week end","lag":"About 1 day after period end, before the Monday cutoff"}}
```

```action
{"type":"add_source","set":2,"kind":"email","label":"Supervisor-approved spreadsheets","how":"Forwarded by the team every Monday with worker reports"}
```

```action
{"type":"cover_topic","topic":"clientHours"}
```

#### Turn 4

**User:** Compare both and ask me about gaps. Pay the worker-reported hours unless we have evidence supporting a correction; always ask before reducing them. Bill the client-approved hours.

**Agent (verbatim, including protocol):**

Where do your pay and bill rates live, and could you forward those rate sheets or client contracts to me?

```card
{"kind":"question","input":"choice","topics":["rates"],"choice":{"yours":"I'll forward our rate sheets or contracts","sample":"Start with sample rates and CA/TX law for now"}}
```

```action
{"type":"set_profile","field":"whoseHours","value":{"payOfRecord":"Worker-reported hours unless evidence supports a correction","billing":"Client-approved hours","gaps":"Compare both sources and ask the operator about every gap","reductions":"Always ask before reducing worker-reported hours"}}
```

```action
{"type":"add_rule","sentence":"Pay worker-reported hours; never reduce them without supporting evidence and operator approval, even when client-approved hours are lower.","bucket":"Custom","kind":"det"}
```

```action
{"type":"add_rule","sentence":"Bill clients the client-approved hours; flag any gap between worker-reported and client-approved hours for operator review.","bucket":"Custom","kind":"det"}
```

```action
{"type":"set_profile","field":"notes","value":{"reductions":"User stated: always ask before reducing worker-reported hours. Other autonomy limits not yet confirmed."}}
```

```action
{"type":"cover_topic","topic":"whoseHours"}
```

#### Turn 5

**User:** Our pay rates and client rules are in rate-card spreadsheets and signed client contracts. I can upload them during our first closeout. California and Texas are right. No other special pay policies yet.

**Agent (verbatim, including protocol):**

When a worker says their paycheck is wrong, where does that usually come in, and who on your team handles it?

```card
{"kind":"question","input":"multi","chips":["Payroll inbox email","Text or call","Through the client or site","Walk-in at the branch","Branch or ops handles it","Payroll handles it","Account manager handles it"],"topics":["complaints"]}
```

```action
{"type":"set_profile","field":"ratesWhere","value":{"source":"Rate-card spreadsheets and signed client contracts","access":"User will upload them during the first closeout","states":"California and Texas confirmed","specialPay":"No other special pay policies stated yet; apply CA and TX law","strictness":"State law and signed contracts are strict"}}
```

```action
{"type":"set_firm","patch":{"states":["CA","TX"]}}
```

```action
{"type":"cover_topic","topic":"rates"}
```

#### Turn 6

**User:** Workers email Payroll when pay looks wrong. I, the Payroll operator, own those complaints, and can forward them to you. Phone complaints become a note here.

**Agent (verbatim, including protocol):**

Besides always asking before reducing hours, what can I fix on my own, and may I message site supervisors or workers directly?

```card
{"kind":"question","input":"multi","chips":["Ask me before any fix","Fix small gaps under $100","Weekly cap $1,000","Email supervisors directly","Text supervisors directly","Text workers directly","No direct contact"],"topics":["authority"]}
```

```action
{"type":"set_profile","field":"complaints","value":{"channel":"Workers email the Payroll inbox when pay looks wrong; phone complaints are logged as notes","owner":"Payroll operator (signed-in user)","handoff":"Operator forwards complaint emails and phone notes to Closeout Agent"}}
```

```action
{"type":"cover_topic","topic":"complaints"}
```

#### Turn 7

**User:** Ask me before fixing anything for now, no autonomous spending. Text supervisors only after I approve the message; do not text workers. Never contact Jordan Smith. I will confirm these settings in the Rulebook.

**Agent (verbatim, including protocol):**

That's everything I need. Closeout Agent will ask before any fix, check each supervisor message with you first, won't text workers, and won't contact Jordan Smith.

```card
{"kind":"onboard_complete"}
```

```action
{"type":"set_authority","patch":{"autoFix":false,"limit":0,"weeklyCap":0,"textSupervisors":false,"textWorkers":false}}
```

```action
{"type":"never_contact","name":"Jordan Smith"}
```

```action
{"type":"set_profile","field":"notes","value":{"reductions":"User stated: always ask before reducing worker-reported hours.","autonomy":"User stated: ask before fixing anything for now; no autonomous spending (limit $0, weekly cap $0).","supervisors":"Text supervisors only after the operator approves each message.","workers":"Do not text workers.","neverContact":"Never contact Jordan Smith.","confirmation":"User will confirm these settings in the Rulebook.","briefing":"Briefing channel not stated; Email remains an unconfirmed proposal."}}
```

```action
{"type":"cover_topic","topic":"authority"}
```

#### Ordinary chat afterward

**User:** Remind me how our worker and client hours arrive and who I said never to contact.

**Agent (verbatim):**

Workers email photos of their time entries to your Payroll inbox, and site supervisors email an approved spreadsheet each Monday. You forward both to me on Mondays, and you told me never to contact Jordan Smith. The file payroll-profile.json is still empty, so I am saving these settings again.

```action
{"type":"set_profile","field":"workerHours","value":{"how":"Workers email photos of their time entries to the Payroll inbox","access":"Team forwards them to Closeout Agent every Monday","expected":"Monday, the day after the Sunday week end"}}
```

```action
{"type":"set_profile","field":"clientHours","value":{"how":"Site supervisors email an approved spreadsheet","access":"Team forwards them to Closeout Agent with the worker reports","expected":"Monday, the day after the Sunday week end"}}
```

```action
{"type":"never_contact","name":"Jordan Smith"}
```

```action
{"type":"set_authority","patch":{"autoFix":false,"limit":0,"weeklyCap":0,"textSupervisors":false,"textWorkers":false}}
```

### Fieldglass source

CLI session: `bd0bf758-4318-480a-a7ce-007aa80b83cc`. Stable across 5 onboarding turns and subsequent chat.

#### Turn 1

**User:** Start onboarding

**Agent (verbatim, including protocol):**

Does this look like your pay calendar: weekly, period ending Sunday, time entries due Monday, Payroll closing Wednesday, payday Friday?

```card
{"kind":"question","input":"calendar","topics":["calendar"],"placeholder":"Tell me what's different, e.g. biweekly, or payday Thursday"}
```

#### Turn 2

**User:** We run weekly Payroll: Sunday week end, hours due Monday, Payroll closes Wednesday and payday Friday. Clients send approved hours through Fieldglass. Workers do not report hours separately. I can schedule the approved-hours export to be forwarded each Monday.

**Agent (verbatim, including protocol):**

Got it. Where do pay rates and client-specific rules live, so I can check them the same way you do?

```card
{"kind":"question","input":"chips","chips":["In Fieldglass","Rate sheet I can share","Client contracts","Back-office system","In someone's head","Not written down"],"placeholder":"Tell me where rates and rules like CA meal breaks live","topics":["rates"]}
```

```action
{"type":"set_calendar","patch":{"frequency":"Weekly","periodEndDay":"Sunday","payDay":"Friday","cutoffDays":1,"deadlineDays":2}}
```

```action
{"type":"cover_topic","topic":"calendar"}
```

```action
{"type":"set_profile","field":"workerHours","value":"Workers do not report hours separately. No worker-reported time source; pay runs from client-approved Fieldglass time."}
```

```action
{"type":"cover_topic","topic":"workerHours"}
```

```action
{"type":"set_profile","field":"clientHours","value":{"how":"Clients approve time entries in Fieldglass","access":"User will schedule the approved-hours export to be forwarded to Closeout Agent each Monday","lag":"Arrives Monday, by the hours cutoff"}}
```

```action
{"type":"add_source","set":2,"kind":"email","label":"Fieldglass approved-hours export","how":"Scheduled export forwarded each Monday (planned, not yet set up)"}
```

```action
{"type":"cover_topic","topic":"clientHours"}
```

```action
{"type":"set_profile","field":"whoseHours","value":"Client-approved Fieldglass time entries are pay-of-record, since workers do not report hours separately. If a worker disputes hours, do not lower pay without evidence and approval."}
```

```action
{"type":"add_rule","sentence":"Never pay a worker less than their claimed hours on a disputed time entry without evidence and Payroll approval.","bucket":"Custom","kind":"det"}
```

```action
{"type":"cover_topic","topic":"whoseHours"}
```

#### Turn 3

**User:** Our pay rates and client rules are in rate-card spreadsheets and signed client contracts. I can upload them during our first closeout. California and Texas are right. No other special pay policies yet.

**Agent (verbatim, including protocol):**

When a worker says their pay is wrong, where does that usually come in, and who handles it today?

```card
{"kind":"question","input":"multi","chips":["Client or site supervisor","Phone or walk-in","Email","Text","Helpdesk tickets","Our app","Branch or ops team","Payroll handles it"],"placeholder":"Where pay complaints arrive and who owns them","topics":["complaints"]}
```

```action
{"type":"set_profile","field":"ratesWhere","value":{"sources":"Rate-card spreadsheets and signed client contracts","access":"User will upload them during the first closeout","states":"CA and TX confirmed","specialPay":"No other special pay policies yet; apply federal, CA and TX law, contracts strict"}}
```

```action
{"type":"set_firm","patch":{"states":["CA","TX"]}}
```

```action
{"type":"cover_topic","topic":"rates"}
```

#### Turn 4

**User:** Workers email Payroll when pay looks wrong. I, the Payroll operator, own those complaints, and can forward them to you. Phone complaints become a note here.

**Agent (verbatim, including protocol):**

What can I fix on my own: pay-affecting fixes up to a dollar limit, or should I ask you first on everything and check before contacting supervisors or workers?

```card
{"kind":"question","input":"multi","chips":["Ask me first on everything","Fix small gaps alone","Up to $100 per entry","Up to $1,000 a week","Text supervisors","Text workers","Email briefing","Slack briefing"],"placeholder":"Your limits, who I may contact, and anyone I should never contact","topics":["authority"]}
```

```action
{"type":"set_profile","field":"complaints","value":{"channel":"Workers email Payroll; phone complaints are logged as notes","owner":"Payroll operator (signed-in user)","handoff":"Operator forwards complaint emails to Closeout Agent and adds phone complaints as notes"}}
```

```action
{"type":"cover_topic","topic":"complaints"}
```

#### Turn 5

**User:** Ask me before fixing anything for now, no autonomous spending. Text supervisors only after I approve the message; do not text workers. Never contact Jordan Smith. I will confirm these settings in the Rulebook.

**Agent (verbatim, including protocol):**

You're all set. I'll ask before every fix, spend nothing on my own, run supervisor texts past you first, never text workers, and never contact Jordan Smith. You can change any of this in the Rulebook.

```card
{"kind":"onboard_complete"}
```

```action
{"type":"set_authority","patch":{"autoFix":false,"limit":0,"weeklyCap":0,"textSupervisors":false,"textWorkers":false}}
```

```action
{"type":"never_contact","name":"Jordan Smith"}
```

```action
{"type":"set_profile","field":"notes","value":{"authority":"Ask first on every fix for now; no autonomous spending (limit $0, weekly cap $0)","supervisorTexts":"Allowed only after operator approves each message","workerTexts":"Not allowed","neverContact":"Jordan Smith","briefing":"Channel not stated; Email remains an unconfirmed proposal","review":"Operator will confirm these settings in the Rulebook"}}
```

```action
{"type":"cover_topic","topic":"authority"}
```

#### Ordinary chat afterward

**User:** Remind me how our worker and client hours arrive and who I said never to contact.

**Agent (verbatim):**

Workers do not report hours separately, and clients approve their hours in Fieldglass. You said you would schedule that export to be forwarded to me each Monday, and it isn't set up yet. You told me never to contact Jordan Smith.
