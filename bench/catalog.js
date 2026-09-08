window.CATALOG = [
{
"id": "PACK-04",
"name": "De minimis time",
"bucket": "Legal",
"juris": "US federal (rejected in CA)",
"statement": "Trivial, hard-to-capture bits of time (courts have allowed up to ~10 min) can be disregarded federally \u2014 but never regularly-occurring time, and California rejects the doctrine entirely.",
"det": "partial \u2014 the minute cap encodes, but 'administratively difficult to capture' and 'irregular' are judgment calls",
"params": "cap\u224810min/day; regularity test; state carve-out list (CA=no de minimis)",
"src": [
"https://www.casemine.com/commentary/us/anderson-v.-mt.-clemens-pottery-co.:-defining-compensable-work-time-under-the-fair-labor-standards-act/view",
"https://www.constangy.com/newsroom/newsletters/California-rejects-em-de-minimis-em-standard-on-state-wage-and-hour-claims"
]
},
{
"id": "PACK-05",
"name": "Regular rate must include differentials and nondiscretionary bonuses",
"bucket": "Legal",
"juris": "US",
"statement": "Overtime is 1.5x the regular rate, not the base rate \u2014 shift differentials, attendance bonuses, and any promised production bonus must be folded in (total remuneration / total hours) before applying the OT premium.",
"det": "yes \u2014 arithmetic, but requires correct classification of each pay component upstream",
"params": "inclusion list (differentials, nondiscretionary bonuses, commissions); exclusion list (discretionary bonuses, gifts, premium pay already at 1.5x); lookback allocation method for lump-sum bonuses",
"src": [
"https://www.dol.gov/agencies/whd/fact-sheets/54-healthcare-overtime",
"https://www.foley.com/insights/publications/2026/03/dol-reminds-employers-to-include-non-discretionary-bonuses-when-calculating-regular-rates-and-overtime-premiums-but-how/"
]
},
{
"id": "PACK-06",
"name": "Blended rate for multiple pay rates in one week",
"bucket": "Legal",
"juris": "US",
"statement": "A worker paid $18 at one client and $22 at another in the same week gets OT at a weighted-average regular rate: total straight-time earnings / total hours, then 0.5x extra on OT hours.",
"det": "yes \u2014 pure arithmetic across all assignments in the week",
"params": "averaging method=weighted (or rate-in-effect if agreed in advance where allowed)",
"src": [
"https://www.dol.gov/agencies/whd/fact-sheets/54-healthcare-overtime",
"https://www.bairdquinn.com/blog/how-to-calculate-overtime-pay/"
]
},
{
"id": "PACK-07",
"name": "Day-rate overtime (Helix v. Hewitt)",
"bucket": "Legal",
"juris": "US",
"statement": "A day rate is not a salary \u2014 day-rate workers still get OT: regular rate = (day rate \u00d7 days worked) / total hours that week, plus 0.5x that rate per OT hour, no matter how high the day rate is.",
"det": "yes \u2014 arithmetic, but requires actual hours tracked for day-rate workers",
"params": "day rate; days worked; hours worked; OT threshold=40h",
"src": [
"https://natlawreview.com/article/daily-rate-workers-and-overtime-compensation-implications-supreme-court-s-upcoming",
"https://www.overtime-flsa.com/faqs/how-are-you-paid/day-rate-workers/"
]
},
{
"id": "PACK-08",
"name": "Travel time compensability",
"bucket": "Legal",
"juris": "US",
"statement": "Home-to-work commute is unpaid; travel between job sites during the workday is paid time and counts toward overtime; travel to a farther-than-usual site is paid for the extra time.",
"det": "partial \u2014 site-to-site travel is detectable from GPS and encodable; 'farther than usual' and special one-day-assignment rules need configured baselines",
"params": "commute baseline distance/time; inter-site travel auto-add toggle",
"src": [
"https://www.smacna.org/resource/fair-labor-standards-act-and-travel-time",
"https://www.overtime-flsa.com/blog/what-counts-as-hours-worked-the-flsa-rules-on-training-meetings-and-waiting-time/"
]
},
{
"id": "PACK-09",
"name": "Waiting and on-call time",
"bucket": "Legal",
"juris": "US",
"statement": "'Engaged to wait' (waiting at the site between tasks) is paid; 'waiting to be engaged' is not; on-call is paid only if restrictions effectively prevent personal use of the time.",
"det": "no \u2014 fact-intensive freedom-of-use test; can only flag candidate intervals (e.g., long on-site gaps between punches) for human review",
"params": "on-site wait auto-pay toggle; response-time threshold for on-call; geographic restriction flag",
"src": [
"https://www.overtime-flsa.com/blog/what-counts-as-hours-worked-the-flsa-rules-on-training-meetings-and-waiting-time/",
"https://www.breakroomapp.com/glossary/compensable-time"
]
},
{
"id": "PACK-10",
"name": "Donning/doffing and pre/post-shift work",
"bucket": "Legal",
"juris": "US",
"statement": "Time putting on required protective gear on premises is paid if integral and indispensable to the job, and so is the walk from gear-up to the workstation.",
"det": "partial \u2014 once a site is classified as requiring gear, a fixed minute allowance encodes cleanly; the classification itself is legal judgment",
"params": "per-site fixed allowance (min/shift) added before first punch / after last punch",
"src": [
"https://carolinaspayrollconference.starchapter.com/images/downloads/2016_Presentations/12___compensable_time_under_flsa.pdf",
"https://www.myhrconcierge.com/2025/08/07/employers-guide-to-understanding-compensable-time-for-non-exempt-employees-under-the-flsa/"
]
},
{
"id": "PACK-11",
"name": "Sleep-time exclusion on 24h+ duty",
"bucket": "Legal",
"juris": "US (home care, live-in)",
"statement": "On a shift of 24h or more, you may exclude up to 8h of scheduled sleep by agreement \u2014 but only with adequate facilities; interruptions are paid, and if the worker can't get at least 5 consecutive hours of sleep the whole period is paid.",
"det": "yes \u2014 thresholds encode; interruption minutes come from call logs/attestation",
"params": "max exclusion=8h; min uninterrupted sleep=5h; agreement-on-file flag; shift length trigger=24h",
"src": [
"https://www.ecfr.gov/current/title-29/subtitle-B/chapter-V/subchapter-B/part-785/subpart-C/subject-group-ECFRecc40629d2c64c8/section-785.22",
"https://www.dol.gov/sites/dolgov/files/WHD/legacy/files/fab2016_1.pdf"
]
},
{
"id": "PACK-12",
"name": "FLSA recordkeeping",
"bucket": "Legal",
"juris": "US",
"statement": "For every nonexempt worker you must keep hours worked each day, total hours each workweek, the regular rate, straight-time and OT earnings, all deductions, and pay dates \u2014 payroll records 3 years, time cards 2 years, producible within 72 hours of a DOL request.",
"det": "yes \u2014 a completeness checklist over stored fields",
"params": "retention: payroll=3yr, time cards/schedules=2yr; production SLA=72h",
"src": [
"https://www.dol.gov/agencies/whd/fact-sheets/21-flsa-recordkeeping",
"https://www.ecfr.gov/current/title-29/subtitle-B/chapter-V/subchapter-A/part-516"
]
},
{
"id": "PACK-14",
"name": "California 7th consecutive day premium",
"bucket": "State",
"juris": "California",
"statement": "Work all seven days of the employer's workweek and the seventh day is 1.5x for the first 8 hours and 2x after 8 \u2014 keyed to the defined workweek, not any rolling 7 days.",
"det": "yes \u2014 countable from daily records once workweek anchor is set",
"params": "consecutive-day count=7 within workweek; first 8h=1.5x; beyond 8h=2x",
"src": [
"https://www.employmentlawaid.org/california/wages-and-hours/overtime-laws/",
"https://myworklaws.com/overtime-laws/california/"
]
},
{
"id": "PACK-16",
"name": "California meal waivers",
"bucket": "State",
"juris": "California",
"statement": "The meal can be waived by mutual consent only if the day's work is 6 hours or less; the second meal is waivable only if total hours \u226412 AND the first meal wasn't waived; on-duty paid meals need a written, revocable agreement and a job that truly prevents relief.",
"det": "yes \u2014 waiver flags plus hour thresholds fully encode; validating the on-duty justification is judgment",
"params": "first-waiver cap=6h; second-waiver cap=12h; waiver-on-file flags; on-duty agreement flag",
"src": [
"https://www.dir.ca.gov/dlse/faq_mealperiods.htm",
"https://www.calchamber.com/california-labor-law/meal-and-rest-breaks"
]
},
{
"id": "PACK-17",
"name": "California rest breaks",
"bucket": "State",
"juris": "California",
"statement": "A paid 10-minute rest break per 4 hours worked 'or major fraction thereof' (so 3.5\u20136h = 1 break, 6\u201310h = 2, 10\u201314h = 3); a missed rest break owes one extra hour at the regular rate for that day.",
"det": "partial \u2014 the count owed is arithmetic, but rest breaks are paid and usually unpunched, so violations are detected by attestation, not punches",
"params": "10min per 4h block; major-fraction trigger=2h; premium=1h/day",
"src": [
"https://www.dir.ca.gov/dlse/RestAndMealPeriods.pdf",
"https://legalclarity.org/what-is-california-labor-code-226-7/"
]
},
{
"id": "PACK-21",
"name": "NY manual-worker weekly pay",
"bucket": "State",
"juris": "New York",
"statement": "'Manual workers' (>25% physical labor \u2014 most shift/warehouse/hospitality workers) must be paid weekly, within 7 calendar days of the end of the week the wages were earned (Labor Law \u00a7191).",
"det": "yes \u2014 pay-run cadence check once the worker is classified manual",
"params": "classification threshold=25% physical work; pay lag cap=7 days; frequency=weekly",
"src": [
"https://www.nysenate.gov/legislation/laws/LAB/191",
"https://dol.ny.gov/frequency-pay"
]
},
{
"id": "PACK-22",
"name": "Colorado daily/consecutive overtime",
"bucket": "State",
"juris": "Colorado",
"statement": "1.5x after 12 hours in a workday, after 12 consecutive hours regardless of shift boundaries, or after 40 in the week \u2014 whichever yields more pay.",
"det": "yes \u2014 three parallel computations, take max",
"params": "daily threshold=12h; consecutive threshold=12h (crosses shifts); weekly=40h; multiplier=1.5x; pick-greatest rule",
"src": [
"https://www.workyard.com/us-labor-laws/colorado-overtime-laws",
"https://pro.bloomberglaw.com/insights/labor-employment/overtime-pay-laws-by-state/"
]
},
{
"id": "PACK-23",
"name": "State daily-OT patchwork",
"bucket": "State",
"juris": "US (per-state)",
"statement": "Most states are weekly-40 only, but Alaska and California have 8h/day OT, Nevada has 8h/day for workers earning under 1.5x minimum wage, Colorado 12h, Oregon 10h in manufacturing/canneries \u2014 the pay engine must key OT rules to work-state.",
"det": "yes \u2014 lookup table by work-state and industry",
"params": "per-state rule table: {AK:8h, CA:8h/12h 2x, NV:8h if rate<1.5x MW, CO:12h, OR-mfg:10h, default:none}",
"src": [
"https://pro.bloomberglaw.com/insights/labor-employment/overtime-pay-laws-by-state/",
"https://www.paycor.com/resource-center/articles/overtime-pay-laws-by-state/"
]
},
{
"id": "PACK-24",
"name": "Other-state reporting/show-up pay",
"bucket": "State",
"juris": "MA, NH, CT, NJ, others",
"statement": "Massachusetts owes 3 hours at minimum wage if a 3h+ shift is cut short; New Hampshire owes 2 hours at the regular rate; Connecticut owes 2\u20134 hours depending on industry; several states have none \u2014 table it by state.",
"det": "yes \u2014 schedule + actual hours + state lookup",
"params": "per-state table: {MA:3h@MW if scheduled\u22653h, NH:2h@regular, CT:2h hotel/restaurant, 4h laundry/mercantile}",
"src": [
"https://www.laborlawcenter.com/education-center/reporting-time-pay-varies-by-state/",
"https://www.shrm.org/topics-tools/news/benefits-compensation/reporting-time-pay-wage-hour-winter-wonderland"
]
},
{
"id": "PACK-25",
"name": "Temp-worker equal pay laws (NJ/IL)",
"bucket": "State",
"juris": "New Jersey, Illinois",
"statement": "Illinois' Day and Temporary Labor Services Act requires temps assigned to a client >90 days to be paid like the client's own comparable employees (720h triggers comparability to lowest-paid similar role); New Jersey's Temp Worker Bill of Rights makes agency and client jointly liable and mandates 4 hours' pay when a scheduled assignment has no work and 2 hours when the worksite changes mid-shift.",
"det": "yes \u2014 day/hour counters against assignment history; the comparable-wage lookup needs client pay data",
"params": "IL trigger=90 days / 720h; NJ min pay: no-work=4h, site change=2h; penalties $500\u2013$5,000/violation (NJ)",
"src": [
"https://trusaic.com/blog/contract-worker-rights-new-jersey-illinois-break-the-mold/",
"https://perkinscoie.com/insights/update/illinois-expands-rights-and-remedies-temporary-workers"
]
},
{
"id": "PACK-26",
"name": "Final-pay timing",
"bucket": "State",
"juris": "per-state (CA strictest)",
"statement": "California: fired = pay everything (including accrued break premiums) immediately; quit without notice = within 72 hours \u2014 miss it and waiting-time penalties run a full day's wages per day up to 30 days. Most states: next regular payday.",
"det": "yes \u2014 date arithmetic against termination event",
"params": "per-state deadline table; CA penalty=1 day wage/day late, cap=30 days",
"src": [
"https://www.paycom.com/resources/blog/final-paycheck-laws-by-state/",
"https://www.seyfarth.com/news-insights/wage-statement-and-final-pay-rules-apply-to-meal-and-rest-break-premiums.html"
]
},
{
"id": "PACK-27",
"name": "Minimum wage by work location",
"bucket": "State",
"juris": "US (state+local patchwork)",
"statement": "Pay the highest of federal, state, and city/county minimum wage for where the shift was actually worked \u2014 Seattle $21.30, Denver $19.29, West Hollywood $20.25 (2026); ~49 localities changed rates on Jan 1 alone, so the rate table is per-geofence, per-date.",
"det": "yes \u2014 geocode the worksite and date-lookup the rate",
"params": "rate table keyed by (lat/long\u2192jurisdiction, effective date, employer size, industry); rule=max(applicable rates)",
"src": [
"https://laborstandards.seattle.gov/2025/09/30/office-of-labor-standards-announces-seattles-2026-minimum-wage",
"https://coloradosun.com/2025/08/07/denvers-minimum-wage-colorado/"
]
},
{
"id": "PACK-28",
"name": "Nurse hour caps / mandatory OT bans",
"bucket": "State",
"juris": "18 states (MA, NY, PA, WA, etc.)",
"statement": "18 states restrict mandatory nurse overtime; Massachusetts flatly bars nurses from working more than 16 consecutive hours in 24 and requires 8 consecutive hours off afterward; Pennsylvania requires 10 hours off after a 12-hour stretch.",
"det": "yes \u2014 consecutive-hour and rest-gap checks on punch history",
"params": "per-state: MA cap=16 consecutive h + 8h off after; PA rest=10h after 12h worked; occupation flag=nurse/healthcare",
"src": [
"https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXVI/Chapter111/Section226",
"https://www.overtime-flsa.com/blog/which-states-restrict-mandatory-overtime-for-nurses/"
]
},
{
"id": "PACK-29",
"name": "Predictive-scheduling advance notice + predictability pay",
"bucket": "Local",
"juris": "Oregon statewide; Seattle, NYC, SF, Chicago, Philadelphia, LA, Emeryville, Berkeley, Evanston",
"statement": "Covered employers (retail/food/hospitality over size thresholds) must post schedules 14 days ahead; any employer-initiated change inside the window triggers premium pay \u2014 one extra hour in Oregon/Chicago/Seattle for additions, $10\u2013$75 per change in NYC.",
"det": "yes \u2014 diff posted schedule vs worked/changed schedule, then per-city premium table",
"params": "notice window=14 days (Philly uses 10 initially, now 14); premium per jurisdiction: OR/CHI/SEA=+1h regular rate for added time, NYC=$10\u2013$75 by change type/timing; covered-industry + headcount thresholds",
"src": [
"https://www.workaxle.com/blog/fair-workweek-laws-2026",
"https://www.joinhomebase.com/blog/predictive-scheduling-laws"
]
},
{
"id": "PACK-32",
"name": "Seattle Secure Scheduling premiums",
"bucket": "Local",
"juris": "Seattle (retail/food, 500+ employees)",
"statement": "Add hours inside the 14-day window: one extra hour of pay. Cut or cancel hours (including sending someone home early): half-time pay for every lost hour. Work during the 10-hour rest window: 1.5x.",
"det": "yes \u2014 schedule-diff arithmetic",
"params": "added-hours premium=+1h; subtracted-hours=0.5x per lost hour; rest window=10h at 1.5x; notice=14 days",
"src": [
"https://www.seattle.gov/documents/Departments/LaborStandards/SS%20QA_FINAL_02272023%20comprehensive.pdf",
"https://www.myshyft.com/schedule-legislation/seattle-secure-scheduling/"
]
},
{
"id": "PACK-34",
"name": "LA Fair Work Week premiums",
"bucket": "Local",
"juris": "City of LA (retail 300+ employees); LA County unincorporated since 7/2025",
"statement": "Employer-initiated change that doesn't cut time (or adds >15 min): one extra hour at the regular rate; cutting at least 15 minutes: half the regular rate for the unworked time.",
"det": "yes \u2014 schedule-diff with a 15-minute materiality filter",
"params": "change premium=+1h; reduction premium=0.5x lost time; materiality threshold=15min; coverage=NAICS retail, 300+ global employees",
"src": [
"https://wagesla.lacity.gov/sites/g/files/wph1941/files/2023-03/Fair%20Work%20Week%20FAQs.pdf",
"https://www.sidley.com/en/insights/newsupdates/2023/03/los-angeles-fair-work-week-means-predictable-schedules-for-retail-employees"
]
},
{
"id": "PACK-35",
"name": "Oregon statewide predictive scheduling",
"bucket": "Local",
"juris": "Oregon (retail/hospitality/food, 500+ employees worldwide)",
"statement": "14 days' schedule notice; adding 30+ minutes to a shift owes one extra hour; the worker gets a 10-hour rest window between shifts paid at 1.5x if worked.",
"det": "yes \u2014 same schedule-diff machinery",
"params": "notice=14 days; addition trigger=30min; addition premium=+1h; rest=10h at 1.5x",
"src": [
"https://www.workaxle.com/blog/fair-workweek-laws-2026",
"https://www.paycom.com/resources/blog/predictive-scheduling-laws/"
]
},
{
"id": "PACK-36",
"name": "Bill rate vs pay rate schedule",
"bucket": "Contract",
"juris": "per-contract",
"statement": "Every position on the work order has its own bill rate; bill rate = pay rate \u00d7 (1 + markup), with markups typically 25\u201375% \u2014 validation means every shift's hours price out at the right position's rate for both payout and invoice.",
"det": "yes \u2014 rate-table lookup keyed to position and site",
"params": "per-position rate table (state, job title, bill rate/hr); markup 25\u201375% typical; effective dates",
"src": [
"https://lgcassociates.com/wp-content/uploads/2023/04/LGC-Staffing-Services-Agreement-July-2021.pdf",
"https://altline.sobanco.com/staffing-agency-markup-rates/"
]
},
{
"id": "PACK-37",
"name": "OT and holiday billing multiplier",
"bucket": "Contract",
"juris": "per-contract (LGC example)",
"statement": "Overtime and holidays are billed at 1.5x the hourly bill rate for hours over 40 in a standard Monday\u2013Sunday week; 'holiday' is an enumerated list (Easter, Memorial Day, July 4th, Labor Day, Thanksgiving, Christmas, NYE, New Year's Day, MLK Day, Juneteenth in LGC's contract).",
"det": "yes \u2014 same OT math applied to bill rate, plus a holiday calendar",
"params": "billing OT multiplier=1.5x; workweek=Mon\u2013Sun; named-holiday list per contract",
"src": [
"https://lgcassociates.com/wp-content/uploads/2023/04/LGC-Staffing-Services-Agreement-July-2021.pdf"
]
},
{
"id": "PACK-39",
"name": "Late-cancellation billing",
"bucket": "Contract",
"juris": "per-contract (LGC example)",
"statement": "Client cancels a work order with fewer than 24 hours' notice: billed 2 hours per canceled worker (other agencies bill 4 hours if canceled under 2 hours before start).",
"det": "yes \u2014 timestamp of cancellation vs shift start",
"params": "notice window=24h (or 2h); penalty=2h (or 4h) per worker at bill rate",
"src": [
"https://lgcassociates.com/wp-content/uploads/2023/04/LGC-Staffing-Services-Agreement-July-2021.pdf",
"https://contracko.com/blog/staffing-agency-contracts"
]
},
{
"id": "PACK-40",
"name": "Timesheet dispute window / approval SLA",
"bucket": "Contract",
"juris": "per-contract (LGC example)",
"statement": "The client must report time or dispute the worker-reported hours within 48 hours of work-order completion; silence means the worker-reported time (or scheduled start/end) is deemed accurate, final, and accepted \u2014 then invoice is Net 30.",
"det": "yes \u2014 clock the dispute window and auto-finalize",
"params": "dispute window=48h; default source on silence=worker-reported time or schedule; payment terms=Net 30",
"src": [
"https://lgcassociates.com/wp-content/uploads/2023/04/LGC-Staffing-Services-Agreement-July-2021.pdf",
"https://invoicedataextraction.com/blog/staffing-agency-invoice-processing"
]
},
{
"id": "PACK-41",
"name": "Conversion / temp-to-hire fee",
"bucket": "Contract",
"juris": "per-contract (LGC example)",
"statement": "Client hires a worker within 12 months who has under 420 hours of temp work: $2,500 referral fee, waived at 420+ hours; unreported conversions can cost up to $10,000 \u2014 so the system must track cumulative hours per worker-client pair.",
"det": "yes \u2014 cumulative hour counter per worker\u00d7client",
"params": "hour threshold=420h; fee=$2,500; lookback=12 months; unnotified-conversion fee up to $10,000",
"src": [
"https://lgcassociates.com/wp-content/uploads/2023/04/LGC-Staffing-Services-Agreement-July-2021.pdf"
]
},
{
"id": "PACK-42",
"name": "Gig-platform attendance policy",
"bucket": "Contract",
"juris": "per-platform (Instawork example)",
"statement": "Not arrived 60 minutes after start = no-show, zero pay, immediate suspension (1 no-show in 30 days = 7-day suspension, 2 = 30 days); cancel within 24 hours of start = late cancel; workers must confirm 48h out and are auto-removed if unconfirmed 16h before start; 15-minute post-booking free-cancel window.",
"det": "yes \u2014 all pure timestamp rules",
"params": "no-show threshold=60min after start; late-cancel window=24h; confirm-by=16h before; grace=15min after booking; suspension ladder 7/30 days",
"src": [
"https://help.instawork.com/en/articles/6122001-cancellation-policy",
"https://help.instawork.com/en/articles/2226313-shift-cancellation-policy"
]
},
{
"id": "PACK-43",
"name": "CBA shift differentials",
"bucket": "CBA",
"juris": "per-CBA",
"statement": "Night/evening/weekend hours carry a premium \u2014 flat (+$3/hr) or percentage (healthcare typically 10\u201320% nights, 15\u201325% weekends) \u2014 applied per hour worked in the differential window, and it feeds the OT regular rate.",
"det": "yes \u2014 window overlap arithmetic on punches",
"params": "window definitions (e.g., 6pm\u20136am, Sat/Sun); rate=flat $/hr or % uplift; interaction=include in regular rate",
"src": [
"https://timeclock44.com/blog/shift-differential-pay-night-weekend-premium/",
"https://legalclarity.org/shift-differentials-and-the-regular-rate-of-pay-flsa-rules/"
]
},
{
"id": "PACK-44",
"name": "CBA overtime distribution / equalization",
"bucket": "CBA",
"juris": "per-CBA",
"statement": "Overtime must be offered by seniority or equalized across the unit over a period \u2014 a payroll validation angle: OT consistently landing on the same few workers is a grievance risk flag.",
"det": "partial \u2014 the equalization ledger is computable, but 'offered and declined' events need capture",
"params": "equalization window (month/quarter); allowable variance in cumulative OT hours; seniority ordering",
"src": [
"https://www.bloomberglaw.com/external/document/X5A6HQAS000000/labor-relations-drafting-guide-overtime-provisions-in-cbas",
"https://fraser.stlouisfed.org/files/docs/publications/bls/bls_0908-18_1950.pdf"
]
},
{
"id": "PACK-45",
"name": "CBA guaranteed hours / call-in guarantees",
"bucket": "CBA",
"juris": "per-CBA",
"statement": "Union contracts commonly guarantee minimum daily hours (e.g., 4-hour show-up guarantee) or weekly hours \u2014 a reported shift below the guarantee is topped up to the guaranteed amount at the regular rate.",
"det": "yes \u2014 max(worked, guaranteed) per day/week",
"params": "daily guarantee (often 4h); weekly guarantee; top-up rate=regular",
"src": [
"https://lawinsider.com/clause/show-up-guarantee",
"https://fraser.stlouisfed.org/files/docs/publications/bls/bls_0908-18_1950.pdf"
]
},
{
"id": "PACK-49",
"name": "Buddy-punch prevention and early-punch lockout",
"bucket": "Facility",
"juris": "per-site policy",
"statement": "Require biometric/photo/GPS identity at punch; lock the clock so workers can't punch in more than 5\u201310 minutes before scheduled start; a 5\u20137 minute grace window is for discipline only \u2014 grace never trims minutes actually worked.",
"det": "yes \u2014 lockout and grace are timestamp rules; the pay-vs-discipline distinction is a hard invariant",
"params": "early-punch lockout=5\u201310min before start; grace window=5\u20137min (enforcement only, not pay); identity method=biometric/photo/geo",
"src": [
"https://www.opentimeclock.com/docs/blog1/february-2026/what-is-a-time-clock-grace-period-and-when-it-causes-wage-claims",
"https://www.7shifts.com/blog/employee-clock-in-and-clock-out-policy/"
]
},
{
"id": "PACK-55",
"name": "Same-second / identical-hours cluster",
"bucket": "Common sense",
"juris": "universal ops heuristic",
"statement": "Multiple workers punching at the exact same second on a shared device, or several timesheets with identical hours all period, points to one person punching for the group \u2014 cluster-flag simultaneous punches and duplicate-hour groups.",
"det": "yes \u2014 grouping/equality tests on punch streams",
"params": "simultaneity window=0\u20132s on same device; duplicate-group size threshold (\u22653 identical timesheets); device ID correlation",
"src": [
"https://onpay.com/insights/timesheet-fraud-prevention/",
"https://www.eportid.com/feeds/blog/employee-time-tracking-fraud-prevention"
]
},
{
"id": "PACK-56",
"name": "Unscheduled/unapproved overtime creep",
"bucket": "Common sense",
"juris": "universal ops heuristic",
"statement": "Routine overtime with no prior approval, chronic clock-ins well before the site opens, or hours consistently pinned at the plan's maximum are the top audit red flags \u2014 compare worked vs scheduled every shift and route variance over the threshold to a supervisor before pay.",
"det": "yes \u2014 schedule-vs-actual variance math; the disposition (pay vs coach) is human",
"params": "variance threshold (e.g., >15min over schedule); OT pre-approval flag; site opening-hours window; frequency trigger (n flags in 30 days)",
"src": [
"https://onpay.com/insights/timesheet-fraud-prevention/",
"https://www.joinhomebase.com/blog/payroll-fraud"
]
}
];
