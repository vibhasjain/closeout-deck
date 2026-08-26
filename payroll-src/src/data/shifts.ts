export type Discrepancy =
  | "missing-clock-out"
  | "duplicate-clock-in"
  | "training-rate"
  | "missed-meal-break"
  | "ot-held-this-week"
  | "facility-clock-cap"

export type Shift = {
  id: string
  worker: string
  initials: string
  facility: string
  role: string
  state: "CA" | "NY" | "TX"
  scheduled: [string, string]
  timesheetIn: string
  timesheetOut: string | null
  locationIn: string
  locationOut: string
  rate: number
  hoursPaid: number
  discrepancy: Discrepancy
  discrepancyLabel: string
  rule: string
  evidence: string[]
  humanAsked?: string
  humanReply?: string
  decision: string
  underCorrected: number
  overCorrected: number
  payout: number
  status: "paid" | "held"
}

export const SHIFTS: Shift[] = [
  {
    id: "4821",
    worker: "Maria R.",
    initials: "MR",
    facility: "Mercy General",
    role: "Housekeeping",
    state: "CA",
    scheduled: ["09:00", "16:30"],
    timesheetIn: "08:58",
    timesheetOut: null,
    locationIn: "08:52",
    locationOut: "17:01:40",
    rate: 24.5,
    hoursPaid: 8.05,
    discrepancy: "missing-clock-out",
    discrepancyLabel: "Clock-out missing",
    rule: "FAC-MERCY-02",
    evidence: ["ADP timesheet", "geofence exit 17:01:40", "rule FAC-MERCY-02"],
    humanAsked: "Dana K. (Housekeeping supervisor)",
    humanReply: "Confirmed — she left at 5, we ran late on the east wing.",
    decision: "Clock-out set to 17:01 (94% confidence), manager confirmed",
    underCorrected: 13.48,
    overCorrected: 0,
    payout: 197.23,
    status: "paid",
  },
  {
    id: "4822",
    worker: "Jamal W.",
    initials: "JW",
    facility: "Northbank Arena",
    role: "Event security",
    state: "NY",
    scheduled: ["14:00", "22:00"],
    timesheetIn: "14:00 & 14:06 (two clock-ins)",
    timesheetOut: "22:04",
    locationIn: "13:52",
    locationOut: "22:09",
    rate: 21,
    hoursPaid: 8.07,
    discrepancy: "duplicate-clock-in",
    discrepancyLabel: "Duplicate clock-in",
    rule: "CS-01",
    evidence: ["Ubeya clock export", "two punches 6 min apart", "rule CS-01"],
    decision: "Second punch merged; one shift, not two",
    underCorrected: 0,
    overCorrected: 84,
    payout: 169.47,
    status: "paid",
  },
  {
    id: "4825",
    worker: "Priya S.",
    initials: "PS",
    facility: "Sutter Health",
    role: "CNA orientation",
    state: "CA",
    scheduled: ["07:00", "15:00"],
    timesheetIn: "06:58",
    timesheetOut: "15:02",
    locationIn: "06:55",
    locationOut: "15:05",
    rate: 18,
    hoursPaid: 8.07,
    discrepancy: "training-rate",
    discrepancyLabel: "Orientation billed at standard rate",
    rule: "CON-SUTTER-01",
    evidence: [
      "Sutter roster: orientation",
      "contract §4.2",
      "rule CON-SUTTER-01",
    ],
    decision: "Paid at training rate per contract; invoice line $0",
    underCorrected: 0,
    overCorrected: 64.56,
    payout: 145.26,
    status: "paid",
  },
  {
    id: "4826",
    worker: "Luis M.",
    initials: "LM",
    facility: "Mercy General",
    role: "Housekeeping",
    state: "CA",
    scheduled: ["06:00", "14:30"],
    timesheetIn: "06:01",
    timesheetOut: "14:31",
    locationIn: "05:58",
    locationOut: "14:33",
    rate: 24.5,
    hoursPaid: 9.5,
    discrepancy: "missed-meal-break",
    discrepancyLabel: "No meal break before hour 5",
    rule: "CA-MB-01",
    evidence: [
      "no break punch",
      "location: continuous on-site",
      "rule CA-MB-01",
    ],
    humanAsked: "Dana K.",
    humanReply: "Correct, we skipped lunch, short-staffed.",
    decision: "1-hour meal premium added",
    underCorrected: 24.5,
    overCorrected: 0,
    payout: 232.75,
    status: "paid",
  },
  {
    id: "4830",
    worker: "Aisha B.",
    initials: "AB",
    facility: "Mercy General",
    role: "ICU tech",
    state: "CA",
    scheduled: ["week", "43.0 h"],
    timesheetIn: "—",
    timesheetOut: null,
    locationIn: "—",
    locationOut: "—",
    rate: 24.5,
    hoursPaid: 40,
    discrepancy: "ot-held-this-week",
    discrepancyLabel: "3.0 h overtime held",
    rule: "TW-1187",
    evidence: [
      "weekly total 43.0 h",
      "temporary rule TW-1187 (Aug 24–30)",
      "manager notified",
    ],
    humanAsked: "Dana K.",
    decision: "3.0 h OT held for review, not paid; manager notified",
    underCorrected: 0,
    overCorrected: 110.25,
    payout: 980,
    status: "held",
  },
  {
    id: "4833",
    worker: "Tom K.",
    initials: "TK",
    facility: "Bayview Warehouse",
    role: "Forklift",
    state: "TX",
    scheduled: ["08:00", "16:30"],
    timesheetIn: "08:02",
    timesheetOut: "16:00 (exactly 8:00 span)",
    locationIn: "badge 07:57",
    locationOut: "badge 16:47",
    rate: 19,
    hoursPaid: 8.75,
    discrepancy: "facility-clock-cap",
    discrepancyLabel: "Facility clock capped at 8:00",
    rule: "FAC-BAYVIEW-01",
    evidence: [
      "facility clock 8:00 exact",
      "door badge 16:47",
      "rule FAC-BAYVIEW-01",
    ],
    humanAsked: "Ray P. (Shift lead)",
    humanReply: "Yeah the clock maxes out, he was here till quarter to five.",
    decision: "Clock-out set to 16:47 from badge, lead confirmed",
    underCorrected: 14.25,
    overCorrected: 0,
    payout: 166.25,
    status: "paid",
  },
]

export const PEOPLE = {
  maria: "Maria R.",
  dana: "Dana K.",
  olivia: "Olivia B.",
  ray: "Ray P.",
  operator: "Sam T.",
} as const

export const RULE_SOURCES = [
  "Legal",
  "State",
  "Facility",
  "Contract",
  "Vertical",
  "Time-based",
  "Common sense",
  "This week",
] as const

export type Rule = {
  id: string
  source: (typeof RULE_SOURCES)[number]
  text: string
  kind: "deterministic" | "llm" | "both"
  expires?: string
  scope?: string
}

export const RULES: Rule[] = [
  {
    id: "LEG-OT-40",
    source: "Legal",
    text: "Overtime after 40 hours in a workweek is paid at 1.5×.",
    kind: "deterministic",
  },
  {
    id: "LEG-TRAIN-01",
    source: "Legal",
    text: "Time spent in required training is paid time.",
    kind: "deterministic",
  },
  {
    id: "CA-MB-01",
    source: "State",
    text: "California: a 30-minute unpaid meal break must start before the end of the 5th hour; if it's missed, pay a 1-hour premium.",
    kind: "deterministic",
  },
  {
    id: "CA-OT-8",
    source: "State",
    text: "California: daily overtime after 8 hours, double time after 12.",
    kind: "deterministic",
  },
  {
    id: "FAC-MERCY-02",
    source: "Facility",
    text: "Mercy General's wall clock caps at 8:00 — treat exact 8:00 clock-outs as suspect and verify with location.",
    kind: "both",
    scope: "Mercy General",
  },
  {
    id: "FAC-BAYVIEW-01",
    source: "Facility",
    text: "Bayview has no GPS indoors; door-badge times are the location evidence.",
    kind: "llm",
    scope: "Bayview Warehouse",
  },
  {
    id: "CON-SUTTER-01",
    source: "Contract",
    text: "Sutter orientation shifts bill $0 and pay at the training rate.",
    kind: "deterministic",
    scope: "Sutter Health",
  },
  {
    id: "CON-NB-03",
    source: "Contract",
    text: "Northbank: egress extension counts as worked only with supervisor confirmation.",
    kind: "llm",
    scope: "Northbank Arena",
  },
  {
    id: "VER-HC-01",
    source: "Vertical",
    text: "Healthcare: shift-handoff overlap up to 15 minutes is paid.",
    kind: "deterministic",
  },
  {
    id: "VER-EV-02",
    source: "Vertical",
    text: "Event security: post-event egress up to 45 minutes is expected; beyond that, ask.",
    kind: "llm",
  },
  {
    id: "TB-ROUND-7",
    source: "Time-based",
    text: "Round to the nearest 15 minutes only when the punch is within 7 minutes.",
    kind: "deterministic",
  },
  {
    id: "TB-WKND-01",
    source: "Time-based",
    text: "Weekend differential starts Saturday 00:00 local time.",
    kind: "deterministic",
  },
  {
    id: "CS-01",
    source: "Common sense",
    text: "Two clock-ins within 10 minutes are one shift, not two.",
    kind: "deterministic",
  },
  {
    id: "CS-02",
    source: "Common sense",
    text: "A clock-out before its clock-in is a typo — ask, don't pay.",
    kind: "llm",
  },
  {
    id: "TW-1187",
    source: "This week",
    text: "No overtime at Mercy General this week.",
    kind: "deterministic",
    scope: "Mercy General",
    expires: "Sun Aug 30",
  },
  {
    id: "TW-1188",
    source: "This week",
    text: "Northbank Championship Final: egress allowed to 23:30 on Saturday only.",
    kind: "deterministic",
    scope: "Northbank Arena",
    expires: "Sat Aug 29",
  },
]

export const MEMORY = [
  {
    date: "Mar 3",
    text: "Mercy General's wall clock caps at 8:00 — learned from 14 identical clock-outs",
  },
  {
    date: "Apr 11",
    text: "Dana K. approves OT for ICU only; housekeeping OT goes to Facilities",
  },
  {
    date: "May 2",
    text: "Sutter orientation shifts pay the training rate",
  },
  {
    date: "Jun 20",
    text: "Bayview: door-badge times are the location source",
  },
  {
    date: "Jul 13",
    text: "Northbank egress extensions need Olivia B.",
  },
  {
    date: "Aug 24",
    text: "No overtime at Mercy General this week (expires Sun)",
  },
] as const

export const MEMORY_STATS = {
  rules: 61,
  facilities: 3,
  people: 14,
  weeks: 22,
} as const

export const AUDIT_START = {
  under: 12418.3,
  over: 9207.75,
} as const
