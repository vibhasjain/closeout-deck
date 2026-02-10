// ============================================
//  TASK DATA — Edit this file to update tasks
//  Push to repo to deploy changes
// ============================================

const PEOPLE = {
  thomas: { name: "Thomas", color: "#06b6d4" },   // cyan
  saurabh: { name: "Saurabh", color: "#f59e0b" },  // amber
  vibhas: { name: "Vibhas", color: "#a855f7" },     // purple
};

const CLIENTS = {
  gigsmart: { name: "GigSmart", color: "#f43f5e" },  // rose
  wonolo: { name: "Wonolo", color: "#3b82f6" },       // blue
};

const TASKS = [
  {
    id: 1,
    title: "Get API documentation over to GigSmart",
    person: "thomas",
    client: "gigsmart",
    status: "in-progress",
    due: "2025-02-09",
  },
  {
    id: 8,
    title: "Expand attestation gate for break violations",
    description: "Trigger attestation for: breaks <30 min, breaks outside compliant window (after 5th hour), and missed punches. Prompt worker with legally required certification language.",
    person: "saurabh",
    client: "wonolo",
    status: "todo",
    due: "2025-02-10",
    doc: "wonolo-meal-break-requirements.pdf",
  },
  {
    id: 9,
    title: "Add guardrails against coercive nudging",
    description: "Agent must never link meal break collection to clocking out, ending shift, or receiving payment. Existential compliance risk.",
    person: "saurabh",
    client: "wonolo",
    status: "todo",
    due: "2025-02-10",
    doc: "wonolo-meal-break-requirements.pdf",
  },
  {
    id: 10,
    title: "Standardize compliance messaging",
    description: "All reminders must consistently include a succinct compliance-focused statement. Audit and standardize across all agent messages.",
    person: "saurabh",
    client: "wonolo",
    status: "todo",
    due: "2025-02-11",
    doc: "wonolo-meal-break-requirements.pdf",
  },
  {
    id: 11,
    title: "Proactive reach-out based on break window timing",
    description: "Send follow-up before the 5th hour of shift (CA compliance). Use movement patterns — if worker is idle 20 min during shift, ask if they're taking a meal break.",
    person: "saurabh",
    client: "wonolo",
    status: "todo",
    due: "2025-02-11",
    doc: "wonolo-meal-break-requirements.pdf",
  },
  {
    id: 12,
    title: "Retroactive collection for previous shift",
    description: "If worker didn't report meal break in previous shift for same engagement, include a reminder to collect it when starting collection flow for new shift.",
    person: "saurabh",
    client: "wonolo",
    status: "todo",
    due: "2025-02-12",
    doc: "wonolo-meal-break-requirements.pdf",
  },
  {
    id: 2,
    title: "Make closeout login map to HyperTrack login",
    person: "thomas",
    status: "todo",
    due: "2025-02-12",
  },
  {
    id: 4,
    title: "Design wizard that accepts org's reconciliation rules",
    description: "Almost like a Claude Code interview — walks through an org's rules step by step",
    person: "vibhas",
    status: "todo",
    due: "2025-02-10",
  },
  {
    id: 5,
    title: "Show reconciliation process in timeline",
    description: "Highlight time comparisons and the rule being applied",
    person: "vibhas",
    status: "todo",
    due: "2025-02-11",
  },
  {
    id: 6,
    title: "Display the timesheets",
    person: "vibhas",
    status: "todo",
    due: "2025-02-12",
  },
  {
    id: 7,
    title: "Design main dashboard view",
    description: "Action hub for the operations person. Actionable, clear, concise, not verbose.",
    person: "vibhas",
    status: "todo",
    due: "2025-02-13",
  },
];
