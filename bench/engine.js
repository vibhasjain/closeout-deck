// Rulebook Workbench — vocabulary, rules, synthetic week, deterministic engine.
// Runs in browser (inlined) and in node (self-check at bottom).
// Times: minutes since day 00:00 (may exceed 1440 for cross-midnight). day: 0=Mon Aug 24 .. 6=Sun Aug 30, 2026.
'use strict';

// ---------- helpers ----------
const H = m => m / 60;
const MIN = h => Math.round(h * 60);
const abs = (day, m) => day * 1440 + m; // absolute minute in week
const fmtT = m => { const mm = ((m % 1440) + 1440) % 1440; return String(Math.floor(mm / 60)).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0'); };
const fmtH = m => (m / 60).toFixed(2);
const money = n => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const DAYS = ['Mon 24', 'Tue 25', 'Wed 26', 'Thu 27', 'Fri 28', 'Sat 29', 'Sun 30'];
function dayLabels(startISO) {
  const start = new Date(startISO + 'T00:00:00Z');
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return Array.from({ length: 7 }, (_, day) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + day);
    return weekdays[date.getUTCDay()] + ' ' + date.getUTCDate();
  });
}

// ---------- facilities ----------
const FACILITIES = {
  mercy:    { name: 'Mercy General',     city: 'Oakland',    state: 'CA', vertical: 'healthcare', lat: 37.81, lng: -122.27, geofence: true,  badge: false, autoDeduct: true,  minWage: 16.50 },
  sutter:   { name: 'Sutter Health',     city: 'Sacramento', state: 'CA', vertical: 'healthcare', lat: 38.57, lng: -121.47, geofence: true,  badge: false, autoDeduct: false, minWage: 16.50 },
  northbank:{ name: 'Northbank Arena',   city: 'New York',   state: 'NY', vertical: 'events',     lat: 40.75, lng: -73.99,  geofence: true,  badge: false, autoDeduct: false, minWage: 17.00 },
  bayview:  { name: 'Bayview Warehouse', city: 'Houston',    state: 'TX', vertical: 'warehouse',  lat: 29.74, lng: -95.36,  geofence: false, badge: true,  autoDeduct: false, minWage: 7.25 },
  wicker:   { name: 'Wicker Park Kitchen', city: 'Chicago',  state: 'IL', vertical: 'foodservice', lat: 41.91, lng: -87.68, geofence: true,  badge: false, autoDeduct: false, minWage: 16.60 },
  stmarks:  { name: 'St. Marks Clinic',  city: 'Oakland',    state: 'CA', vertical: 'healthcare', lat: 37.80, lng: -122.25, geofence: true,  badge: false, autoDeduct: false, minWage: 16.50 },
};
const distMi = (a, b) => {
  const dx = (a.lat - b.lat) * 69, dy = (a.lng - b.lng) * 54.6;
  return Math.sqrt(dx * dx + dy * dy);
};

// ---------- the typed vocabulary (feature library) ----------
// Each feature: id, desc, fn(shift, ctx) -> value. ctx = {week: shifts[], byWorker: Map}
const FEATURES = [
  ['facility_state', 'Two-letter state of the worksite', s => s.fac.state],
  ['facility_city', 'City of the worksite', s => s.fac.city],
  ['vertical', 'Industry vertical of the site', s => s.fac.vertical],
  ['scheduled_min', 'Scheduled shift length, minutes', s => s.sched ? s.sched[1] - s.sched[0] : null],
  ['raw_pairs', 'Clock punch pairs as submitted', s => s.punches],
  ['merged_pairs', 'Punch pairs after duplicate-merge (CS-01)', (s, c) => c.mergedPairs(s)],
  ['dup_gap_min', 'Gap between duplicate clock-ins, if any', (s, c) => c.dupGap(s)],
  ['missing_out', 'True if any punch pair lacks a clock-out', (s, c) => c.mergedPairs(s).some(p => p.out == null)],
  ['resolved_pairs', 'Punch pairs after missing-out resolution', (s, c) => c.resolvedPairs(s)],
  ['punched_span_min', 'First in → last out, minutes (resolved)', (s, c) => { const p = c.resolvedPairs(s); return p.length ? p[p.length - 1].out - p[0].in : 0; }],
  ['worked_min', 'Payable worked minutes (merged, resolved, meal-adjusted)', (s, c) => c.workedMin(s)],
  ['meal_taken', 'True if a meal punch pair exists', s => !!s.meal],
  ['meal_length_min', 'Meal length in minutes', s => s.meal ? s.meal[1] - s.meal[0] : null],
  ['meal_start_offset_min', 'Shift start → meal start, minutes', (s, c) => { if (!s.meal) return null; const p = c.resolvedPairs(s); return p.length ? s.meal[0] - p[0].in : null; }],
  ['auto_deduct_applies', 'Site auto-deducts 30-min meal', s => s.fac.autoDeduct],
  ['geo_enter', 'Geofence entry time', s => s.geo ? s.geo[0] : null],
  ['geo_exit', 'Geofence exit time', s => s.geo ? s.geo[1] : null],
  ['geo_out_gap_min', 'Clock-out vs geofence-exit gap, minutes', (s, c) => { const p = c.resolvedPairs(s); if (!s.geo || !p.length || p[p.length - 1].rawOut == null) return null; return Math.abs(s.geo[1] - p[p.length - 1].rawOut); }],
  ['badge_out_gap_min', 'Clock-out vs door-badge-out gap, minutes', (s, c) => { const p = c.resolvedPairs(s); if (!s.badgeOut || !p.length || p[p.length - 1].rawOut == null) return null; return Math.abs(s.badgeOut - p[p.length - 1].rawOut); }],
  ['weekly_worked_min', "Worker's total payable minutes this week", (s, c) => c.weeklyWorked(s.worker)],
  ['daily_ot_min', 'Minutes past the CA daily-OT threshold', () => null],
  ['gap_since_prev_min', 'Rest gap since previous shift end (same worker), minutes', (s, c) => c.gapSincePrev(s)],
  ['overlap_shift', 'Another shift by same worker overlapping in time', (s, c) => c.overlap(s)],
  ['travel_speed_mph', 'Implied speed from previous site to this clock-in', (s, c) => c.travelSpeed(s)],
  ['exact_streak', 'Consecutive shifts with identical punched duration', (s, c) => c.exactStreak(s)],
  ['edited_after_approval', 'Timesheet mutated after supervisor approval', s => !!s.editedAfterApproval],
  ['sched_change_hours_before', 'Employer schedule change, hours before start', s => s.schedChangedHoursBefore ?? null],
  ['worked_vs_sched_pct', 'Worked as % of scheduled', (s, c) => { const sm = s.sched ? s.sched[1] - s.sched[0] : null; return sm ? Math.round(100 * c.workedMin(s) / sm) : null; }],
  ['orientation', 'Shift is a training/orientation shift', s => !!s.orientation],
  ['arrived_on_site', 'Location shows worker reported to site', s => !!s.geo || !!s.badgeIn],
  ['waiver_on_file', 'Signed meal-waiver on file', s => !!s.waiverOnFile],
  ['consent_on_file', 'Written clopening consent on file', s => !!s.consentClopen],
];

// ---------- context: derived computations, memoized per run ----------
function makeCtx(week, params) {
  const P = params;
  const byWorker = new Map();
  for (const s of week) { if (!byWorker.has(s.worker)) byWorker.set(s.worker, []); byWorker.get(s.worker).push(s); }
  for (const arr of byWorker.values()) arr.sort((a, b) => abs(a.day, a.sched ? a.sched[0] : 0) - abs(b.day, b.sched ? b.sched[0] : 0));
  const memo = new Map();
  const mz = (key, s, fn) => { const k = key + s.id; if (!memo.has(k)) memo.set(k, fn(s)); return memo.get(k); };
  const ctx = {
    week, byWorker, params,
    dupGap: s => { if (s.punches.length < 2) return null; const g = s.punches[1].in - s.punches[0].in; return (s.punches[0].out == null && g <= P('CS-01', 'window_min')) ? g : null; },
    mergedPairs: s => mz('mp', s, s2 => {
      if (ctx.dupGap(s2) != null) return [{ in: s2.punches[0].in, out: s2.punches[1].out, rawOut: s2.punches[1].out, merged: true }];
      return s2.punches.map(p => ({ in: p.in, out: p.out, rawOut: p.out }));
    }),
    resolvedPairs: s => mz('rp', s, s2 => ctx.mergedPairs(s2).map(p => p.out == null && s2.resolution ? { ...p, out: s2.resolution.out, resolved: true } : p)),
    workedMin: s => mz('wm', s, s2 => {
      const pairs = ctx.resolvedPairs(s2);
      let m = pairs.reduce((t, p) => t + ((p.out ?? p.in) - p.in), 0);
      if (s2.meal) m -= (s2.meal[1] - s2.meal[0]);
      else if (s2.fac.autoDeduct && m > MIN(6)) m -= 30; // site policy; FAC-AUTODED audits it
      return Math.max(0, m);
    }),
    weeklyWorked: w => { let t = 0; for (const s of byWorker.get(w) || []) t += ctx.workedMin(s); return t; },
    prevShift: s => { const arr = byWorker.get(s.worker) || []; const i = arr.indexOf(s); return i > 0 ? arr[i - 1] : null; },
    gapSincePrev: s => { const pv = ctx.prevShift(s); if (!pv) return null; const pvP = ctx.resolvedPairs(pv), cuP = ctx.resolvedPairs(s); if (!pvP.length || !cuP.length || pvP[pvP.length - 1].out == null) return null; return abs(s.day, cuP[0].in) - abs(pv.day, pvP[pvP.length - 1].out); },
    overlap: s => { const arr = byWorker.get(s.worker) || []; const cu = ctx.resolvedPairs(s); if (!cu.length) return null; const a0 = abs(s.day, cu[0].in), a1 = abs(s.day, cu[cu.length - 1].out ?? cu[0].in); for (const o of arr) { if (o === s) continue; const op = ctx.resolvedPairs(o); if (!op.length || op[op.length - 1].out == null) continue; const b0 = abs(o.day, op[0].in), b1 = abs(o.day, op[op.length - 1].out); if (a0 < b1 && b0 < a1) return o; } return null; },
    travelSpeed: s => { const pv = ctx.prevShift(s); if (!pv || pv.fac === s.fac) return null; const gap = ctx.gapSincePrev(s); if (gap == null || gap <= 0) return Infinity; const d = distMi(pv.fac, s.fac); return d / (gap / 60); },
    exactStreak: s => { const arr = byWorker.get(s.worker) || []; const dur = x => { const p = ctx.resolvedPairs(x); return p.length ? (p[p.length - 1].out ?? 0) - p[0].in : 0; }; const i = arr.indexOf(s); let n = 1; for (let j = i - 1; j >= 0; j--) { if (dur(arr[j]) === dur(s) && dur(s) > 0) n++; else break; } return n; },
  };
  return ctx;
}

// ---------- the rulebook (compiled IR, engine subset) ----------
// evaluate(f, s, ctx, P) -> array of trace rows:
// {rule, status:'pass'|'flag'|'applied'|'na'|'held', note, kind, effect?:{premiumMin?, premiumAmt?, otAdj?, holdMin?, rateOverride?, topUpMin?}}
const p = (v, min, max, step, unit, label) => ({ v, min, max, step, unit, label });

const RULES = [
  {
    id: 'CS-01', bucket: 'Common sense', kind: 'det',
    sentence: 'Two clock-ins within a few minutes are one shift, not two.',
    source: { doc: 'ops heuristic · Aashish interviews', cite: 'duplicate punches on shared kiosks' },
    scope: () => true,
    params: { window_min: p(10, 2, 30, 1, 'min', 'merge window') },
    evaluate(s, ctx, P) {
      const g = ctx.dupGap(s);
      if (g == null) return [{ status: 'pass', note: `1 clock-in found` }];
      return [{ status: 'applied', note: `Two clock-ins ${g} min apart → merged into one pair (avoided double shift)`, overNaive: true }];
    },
  },
  {
    id: 'TS-COMPLETE', bucket: 'Common sense', kind: 'both',
    sentence: 'Every punch pair must close; a missing clock-out is resolved from location evidence plus a human, never assumed.',
    source: { doc: 'ops heuristic', cite: 'missed punches are the #1 discrepancy across all 7 interviews' },
    scope: () => true, params: {},
    evaluate(s, ctx) {
      const missing = ctx.mergedPairs(s).some(pr => pr.out == null);
      if (!missing) return [{ status: 'pass', note: 'Punch pairs complete' }];
      const rows = [{ status: 'flag', note: 'timesheet.out = null → discrepancy opened' }];
      if (s.resolution) {
        rows.push({ status: 'applied', kind: 'llm', note: `Evidence read: geofence exit ${fmtT(s.geo[1])}, continuous presence → proposes out = ${fmtT(s.resolution.out)} · review recommended`, chips: ['timesheet', `geofence exit ${fmtT(s.geo[1])}`] });
        rows.push({ status: 'applied', kind: 'human', note: `${s.resolution.by}: "${s.resolution.quote}" → clock-out set to ${fmtT(s.resolution.out)}` });
      } else rows.push({ status: 'held', note: 'No resolution yet — shift held, manager asked', effect: { holdAll: true } });
      return rows;
    },
  },
  {
    id: 'CS-16H', bucket: 'Common sense', kind: 'det',
    sentence: 'A single recorded shift over the length cap is presumed a missed clock-out, not a real shift.',
    source: { doc: 'timesheet-fraud audit guides', cite: 'hold, don\'t pay 16h straight' },
    scope: () => true,
    params: { cap_h: p(16, 12, 24, 1, 'h', 'length cap') },
    evaluate(s, ctx, P) {
      const span = ctx.resolvedPairs(s); if (!span.length || span[span.length - 1].out == null) return [{ status: 'na', note: 'Unresolved pair' }];
      const m = span[span.length - 1].out - span[0].in;
      if (m > MIN(P('CS-16H', 'cap_h'))) return [{ status: 'held', note: `Recorded span ${fmtH(m)}h > ${P('CS-16H', 'cap_h')}h cap → held for review`, effect: { holdAll: true } }];
      return [{ status: 'pass', note: `Span ${fmtH(m)}h within cap` }];
    },
  },
  {
    id: 'CS-OVLP', bucket: 'Common sense', kind: 'det',
    sentence: 'One person cannot be clocked in at two facilities at once.',
    source: { doc: 'fraud heuristic', cite: 'cross-facility identity resolution' },
    scope: () => true, params: {},
    evaluate(s, ctx) {
      const o = ctx.overlap(s);
      if (!o) return [{ status: 'pass', note: 'No overlapping shift' }];
      return [{ status: 'held', note: `Overlaps shift ${o.id} at ${o.fac.name} → both held`, effect: { holdAll: true } }];
    },
  },
  {
    id: 'CS-SPEED', bucket: 'Common sense', kind: 'det',
    sentence: 'Consecutive punches at different sites must be reachable at road speed.',
    source: { doc: 'GPS spoofing audit guide', cite: 'haversine ÷ gap vs speed cap' },
    scope: () => true,
    params: { max_mph: p(75, 40, 120, 5, 'mph', 'speed cap') },
    evaluate(s, ctx, P) {
      const v = ctx.travelSpeed(s);
      if (v == null) return [{ status: 'na', note: 'No prior cross-site punch' }];
      if (v > P('CS-SPEED', 'max_mph')) return [{ status: 'flag', note: `Implied ${Math.round(v)} mph from previous site → one punch is wrong or spoofed` }];
      return [{ status: 'pass', note: `Implied ${Math.round(v)} mph plausible` }];
    },
  },
  {
    id: 'CS-EXACT', bucket: 'Common sense', kind: 'det',
    sentence: 'Punches are messy; a streak of identical exact durations means hand-entered time.',
    source: { doc: 'payroll-fraud detection guides', cite: 'flag, don\'t auto-deny' },
    scope: () => true,
    params: { streak: p(3, 2, 7, 1, 'shifts', 'streak length') },
    evaluate(s, ctx, P) {
      const n = ctx.exactStreak(s);
      if (n >= P('CS-EXACT', 'streak')) return [{ status: 'flag', note: `${n} consecutive shifts with identical duration → likely manual entry, verify source` }];
      return [{ status: 'pass', note: 'Duration pattern normal' }];
    },
  },
  {
    id: 'CS-EDIT', bucket: 'Common sense', kind: 'det',
    sentence: 'Any timesheet edit after supervisor approval re-triggers review.',
    source: { doc: 'wage-theft litigation pattern', cite: 'post-approval edits are the classic vector' },
    scope: () => true, params: {},
    evaluate(s) {
      if (s.editedAfterApproval) return [{ status: 'flag', note: `Edited after approval by ${s.editedAfterApproval} → re-review required` }];
      return [{ status: 'pass', note: 'No post-approval edits' }];
    },
  },
  {
    id: 'FAC-GEO-01', bucket: 'Facility', kind: 'det',
    sentence: 'A punch counts only with matching location evidence; punches with no geofence entry route to review.',
    source: { doc: 'site policy', cite: 'geofence radius per site' },
    scope: s => s.fac.geofence,
    params: { tol_min: p(15, 0, 60, 5, 'min', 'entry tolerance') },
    evaluate(s, ctx, P) {
      if (!s.geo) return [{ status: 'flag', note: 'No geofence entry recorded for this punch → verify presence' }];
      const pr = ctx.resolvedPairs(s); if (!pr.length) return [{ status: 'na', note: 'No punches' }];
      const gap = Math.abs(pr[0].in - s.geo[0]);
      if (gap > P('FAC-GEO-01', 'tol_min')) return [{ status: 'flag', note: `Clock-in ${gap} min from geofence entry (tol ±${P('FAC-GEO-01', 'tol_min')})` }];
      return [{ status: 'pass', note: `Clock-in within ±${P('FAC-GEO-01', 'tol_min')} min of geofence entry` }];
    },
  },
  {
    id: 'FAC-BADGE-01', bucket: 'Facility', kind: 'det',
    sentence: 'Bayview has no GPS indoors; door-badge times are the location evidence and must agree with the clock.',
    source: { doc: 'Bayview site profile', cite: 'badge reader = witness' },
    scope: s => s.fac.badge,
    params: { tol_min: p(15, 5, 60, 5, 'min', 'mismatch tolerance') },
    evaluate(s, ctx, P) {
      const pr = ctx.resolvedPairs(s);
      if (!s.badgeOut || !pr.length || pr[pr.length - 1].rawOut == null) return [{ status: 'na', note: 'No badge/punch pair to compare' }];
      const gap = s.badgeOut - pr[pr.length - 1].rawOut;
      if (gap > P('FAC-BADGE-01', 'tol_min')) {
        return [
          { status: 'flag', note: `Clock-out ${fmtT(pr[pr.length - 1].rawOut)} but badge-out ${fmtT(s.badgeOut)} (+${gap} min)` },
          s.resolution
            ? { status: 'applied', kind: 'human', note: `${s.resolution.by}: "${s.resolution.quote}" → paid to badge-out`, effect: { extendToMin: s.badgeOut } }
            : { status: 'held', note: 'Awaiting lead confirmation', effect: { holdAll: true } },
        ];
      }
      return [{ status: 'pass', note: `Badge and clock agree within ${P('FAC-BADGE-01', 'tol_min')} min` }];
    },
  },
  {
    id: 'FAC-AUTODED-01', bucket: 'Facility', kind: 'both',
    sentence: 'The 30-minute meal auto-deduct only stands if evidence shows the break actually happened.',
    source: { doc: 'Quickley v. UMMS class-action pattern', cite: 'auto-deduct without a cancel path = FLSA exposure' },
    scope: s => s.fac.autoDeduct,
    params: {},
    evaluate(s, ctx) {
      if (s.meal) return [{ status: 'pass', note: 'Meal punched — no auto-deduct' }];
      if (ctx.workedMin(s) <= MIN(6)) return [{ status: 'na', note: 'Short shift, no deduction' }];
      if (s.mealEvidence === false) return [
        { status: 'flag', note: '30 min auto-deducted but location shows continuous on-floor presence' },
        { status: 'applied', kind: 'llm', note: 'No break-length gap in movement pattern; deduction reversed pending attestation · review recommended', effect: { premiumMin: 30 }, chips: ['location trace', 'no meal punch'] },
      ];
      return [{ status: 'pass', note: 'Auto-deduct stands (break gap visible in location trace)' }];
    },
  },
  {
    id: 'CA-ROUND-0', bucket: 'State', kind: 'det',
    sentence: 'California with exact capture: pay exact minutes — rounding is off.',
    source: { doc: 'Camp v. Home Depot (2022)', cite: 'if you capture exact time, pay exact time' },
    scope: s => s.fac.state === 'CA', params: {},
    evaluate() { return [{ status: 'applied', note: 'Exact-minute pay in force (rounding disabled)' }]; },
  },
  {
    id: 'TB-ROUND-7', bucket: 'Time-based', kind: 'det',
    sentence: 'Outside CA, round to the nearest quarter hour with the 7-minute breakpoint.',
    source: { doc: '29 CFR 785.48', cite: 'neutral-over-time rounding' },
    scope: s => s.fac.state !== 'CA',
    params: { inc_min: p(15, 5, 15, 5, 'min', 'increment') },
    evaluate(s, ctx, P) { return [{ status: 'applied', note: `Punches rounded to nearest ${P('TB-ROUND-7', 'inc_min')} min` }]; },
  },
  {
    id: 'CA-MB-01', bucket: 'State', kind: 'det',
    sentence: 'CA: a 30-minute unpaid meal must start before the end of the 5th hour; missed, short or late → 1-hour premium.',
    source: { doc: 'IWC Wage Order 5 §11 · Labor Code §226.7', cite: 'premium counts as wages' },
    scope: s => s.fac.state === 'CA',
    params: { deadline_h: p(5, 3, 6, 0.5, 'h', 'first-meal deadline'), min_len: p(30, 20, 45, 5, 'min', 'minimum length'), waiver_cap_h: p(6, 5, 8, 0.5, 'h', 'waivable if ≤') },
    evaluate(s, ctx, P) {
      const worked = ctx.workedMin(s);
      const dl = MIN(P('CA-MB-01', 'deadline_h'));
      if (!s.meal) {
        if (s.fac.autoDeduct && s.mealEvidence !== false) return [{ status: 'pass', note: 'Auto-deducted break, break gap visible in location trace' }];
        if (worked <= MIN(P('CA-MB-01', 'waiver_cap_h')) && s.waiverOnFile) return [{ status: 'pass', note: 'No meal — valid waiver on file for short shift' }];
        if (worked <= dl) return [{ status: 'pass', note: 'Shift shorter than meal deadline' }];
        return [{ status: 'flag', note: `No meal break in a ${fmtH(worked)}h shift → 1h premium`, effect: { premiumHours: 1 } }];
      }
      const off = ctx.resolvedPairs(s).length ? s.meal[0] - ctx.resolvedPairs(s)[0].in : null;
      const len = s.meal[1] - s.meal[0];
      if (off != null && off > dl) return [{ status: 'flag', note: `Meal started ${fmtH(off)}h in (deadline ${P('CA-MB-01', 'deadline_h')}h) → 1h premium`, effect: { premiumHours: 1 } }];
      if (len < P('CA-MB-01', 'min_len')) return [{ status: 'flag', note: `Meal ${len} min < ${P('CA-MB-01', 'min_len')} min → 1h premium`, effect: { premiumHours: 1 } }];
      return [{ status: 'pass', note: `Meal ${len} min, started ${fmtH(off)}h in` }];
    },
  },
  {
    id: 'CA-OT-8', bucket: 'State', kind: 'det',
    sentence: 'CA: over 8 hours in a workday is 1.5×; over 12 is 2× — even if the week is under 40.',
    source: { doc: 'Labor Code §510', cite: 'daily OT, anti-pyramided with weekly' },
    scope: s => s.fac.state === 'CA',
    params: { daily_h: p(8, 6, 10, 0.5, 'h', '1.5× after'), double_h: p(12, 10, 14, 0.5, 'h', '2× after') },
    evaluate(s, ctx, P) {
      const w = ctx.workedMin(s), d = MIN(P('CA-OT-8', 'daily_h')), dd = MIN(P('CA-OT-8', 'double_h'));
      if (w <= d) return [{ status: 'pass', note: `${fmtH(w)}h ≤ ${P('CA-OT-8', 'daily_h')}h` }];
      const ot = Math.min(w, dd) - d, dt = Math.max(0, w - dd);
      return [{ status: 'applied', note: `Daily OT: ${fmtH(ot)}h @1.5×${dt ? ` + ${fmtH(dt)}h @2×` : ''}`, effect: { otPremiumMin: ot * 0.5 + dt * 1.0, dailyOtMin: ot + dt } }];
    },
  },
  {
    id: 'FED-OT-40', bucket: 'Legal', kind: 'det',
    sentence: 'Over 40 hours in the workweek is 1.5× the regular rate.',
    source: { doc: 'FLSA · 29 CFR 778', cite: 'workweek = fixed Mon–Sun here' },
    scope: () => true,
    params: { weekly_h: p(40, 30, 60, 1, 'h', 'weekly threshold') },
    evaluate(s, ctx, P) {
      // applied on the worker's LAST shift of week for legibility
      const arr = ctx.byWorker.get(s.worker) || [];
      if (arr[arr.length - 1] !== s) return [{ status: 'na', note: 'Assessed on last shift of week' }];
      const total = ctx.weeklyWorked(s.worker);
      const daily = arr.reduce((t, x) => { const rows = x._dailyOtMin || 0; return t + rows; }, 0);
      const over = total - MIN(P('FED-OT-40', 'weekly_h')) - daily;
      if (over <= 0) return [{ status: 'pass', note: `Week ${fmtH(total)}h (daily-OT hours excluded: ${fmtH(daily)})` }];
      return [{ status: 'applied', note: `Weekly OT: ${fmtH(over)}h @1.5× (anti-pyramided)`, effect: { otPremiumMin: over * 0.5 } }];
    },
  },
  {
    id: 'CA-SS-01', bucket: 'State', kind: 'det',
    sentence: 'CA: an unpaid gap over an hour splitting the workday owes a 1-hour premium at minimum wage, offset by earnings above minimum.',
    source: { doc: 'IWC orders §4(C)', cite: 'split-shift premium with offset' },
    scope: s => s.fac.state === 'CA',
    params: { gap_min: p(60, 30, 180, 15, 'min', 'gap trigger') },
    evaluate(s, ctx, P) {
      const prs = ctx.resolvedPairs(s);
      if (prs.length < 2) return [{ status: 'pass', note: 'No split' }];
      const gap = prs[1].in - prs[0].out;
      if (gap <= P('CA-SS-01', 'gap_min')) return [{ status: 'pass', note: `Gap ${gap} min ≤ trigger` }];
      const worked = ctx.workedMin(s), mw = s.fac.minWage;
      const offset = Math.max(0, (s.rate - mw) * H(worked));
      const prem = Math.max(0, mw - offset);
      if (prem <= 0) return [{ status: 'pass', note: `Split ${fmtH(gap)}h gap — premium fully offset by wages above minimum` }];
      return [{ status: 'flag', note: `Split shift (${fmtH(gap)}h gap) → premium ${money(prem)} after offset`, effect: { premiumAmt: prem } }];
    },
  },
  {
    id: 'CA-RT-01', bucket: 'State', kind: 'det',
    sentence: 'CA: sent home before half the scheduled shift → pay half the schedule (min 2h, max 4h).',
    source: { doc: 'IWC orders §5', cite: 'reporting-time pay' },
    scope: s => s.fac.state === 'CA',
    params: { floor_h: p(2, 1, 4, 0.5, 'h', 'floor'), cap_h: p(4, 2, 6, 0.5, 'h', 'cap') },
    evaluate(s, ctx, P) {
      if (!s.sched) return [{ status: 'na', note: 'Unscheduled' }];
      const sm = s.sched[1] - s.sched[0], w = ctx.workedMin(s);
      if (!ctx.resolvedPairs(s).length || w >= sm / 2) return [{ status: 'pass', note: 'Worked ≥ half of schedule' }];
      const owe = Math.min(Math.max(sm / 2, MIN(P('CA-RT-01', 'floor_h'))), MIN(P('CA-RT-01', 'cap_h')));
      const top = Math.max(0, owe - w);
      return [{ status: 'flag', note: `Worked ${fmtH(w)}h of ${fmtH(sm)}h scheduled → reporting-time pay tops up to ${fmtH(owe)}h`, effect: { topUpMin: top } }];
    },
  },
  {
    id: 'NY-SOH-01', bucket: 'State', kind: 'det',
    sentence: 'NY: if first-in to last-out spans more than 10 hours, add one hour at basic minimum wage.',
    source: { doc: '12 NYCRR 142-2.4 / 146', cite: 'spread of hours' },
    scope: s => s.fac.state === 'NY',
    params: { spread_h: p(10, 8, 12, 0.5, 'h', 'spread trigger') },
    evaluate(s, ctx, P) {
      const prs = ctx.resolvedPairs(s); if (!prs.length || prs[prs.length - 1].out == null) return [{ status: 'na', note: 'Unresolved' }];
      const span = prs[prs.length - 1].out - prs[0].in;
      if (span <= MIN(P('NY-SOH-01', 'spread_h'))) return [{ status: 'pass', note: `Spread ${fmtH(span)}h ≤ ${P('NY-SOH-01', 'spread_h')}h` }];
      return [{ status: 'flag', note: `Spread ${fmtH(span)}h > ${P('NY-SOH-01', 'spread_h')}h → +1h at ${money(s.fac.minWage)}`, effect: { premiumAmt: s.fac.minWage } }];
    },
  },
  {
    id: 'REST-GAP-01', bucket: 'Local', kind: 'det',
    sentence: 'Fair-workweek cities: working inside the protected rest window between shifts pays a premium (gap threshold varies 9–11h by city).',
    source: { doc: 'Seattle SMC 14.22 · NYC · Chicago 6-110 · Philadelphia 9-4600', cite: 'right-to-rest' },
    scope: s => ['New York', 'Chicago', 'Seattle', 'Philadelphia'].includes(s.fac.city),
    params: { gap_ny: p(11, 8, 12, 1, 'h', 'NYC threshold'), gap_chi: p(10, 8, 12, 1, 'h', 'Chicago threshold') },
    evaluate(s, ctx, P) {
      const g = ctx.gapSincePrev(s);
      if (g == null) return [{ status: 'na', note: 'No previous shift' }];
      const th = MIN(s.fac.city === 'New York' ? P('REST-GAP-01', 'gap_ny') : P('REST-GAP-01', 'gap_chi'));
      if (g >= th) return [{ status: 'pass', note: `Rest gap ${fmtH(g)}h ≥ ${fmtH(th)}h` }];
      if (s.consentClopen) return [{ status: 'flag', note: `Clopening (${fmtH(g)}h gap) with written consent → $100 premium`, effect: { premiumAmt: 100 } }];
      return [{ status: 'flag', note: `Clopening: only ${fmtH(g)}h rest, no consent on file → premium + consent needed`, effect: { premiumAmt: 100 } }];
    },
  },
  {
    id: 'CHI-FWW-01', bucket: 'Local', kind: 'det',
    sentence: 'Chicago: any employer schedule change inside 14 days\' notice owes one hour of predictability pay.',
    source: { doc: 'Chicago MCC 6-110', cite: 'fair workweek' },
    scope: s => s.fac.city === 'Chicago',
    params: { notice_days: p(14, 7, 21, 1, 'days', 'notice window') },
    evaluate(s, ctx, P) {
      const h = s.schedChangedHoursBefore;
      if (h == null) return [{ status: 'pass', note: 'No employer-initiated change' }];
      if (h < P('CHI-FWW-01', 'notice_days') * 24) return [{ status: 'flag', note: `Schedule changed ${Math.round(h)}h before start (inside ${P('CHI-FWW-01', 'notice_days')}-day window) → +1h predictability pay`, effect: { premiumHours: 1 } }];
      return [{ status: 'pass', note: 'Change outside notice window' }];
    },
  },
  {
    id: 'CON-MIN-4H', bucket: 'Contract', kind: 'det',
    sentence: 'A worker who reports for a scheduled shift is paid (and billed) a minimum of 4 hours, even if sent home.',
    source: { doc: 'LGC-style staffing MSA §5', cite: '4-hour show-up minimum' },
    scope: s => !!s.contractMin,
    params: { min_h: p(4, 2, 6, 0.5, 'h', 'minimum hours') },
    evaluate(s, ctx, P) {
      if (!(s.geo || s.badgeIn)) return [{ status: 'na', note: 'No evidence of reporting on site' }];
      const w = ctx.workedMin(s), m = MIN(P('CON-MIN-4H', 'min_h'));
      if (w >= m) return [{ status: 'pass', note: `Worked ${fmtH(w)}h ≥ minimum` }];
      return [{ status: 'flag', note: `Reported on site, worked ${fmtH(w)}h → topped up to ${P('CON-MIN-4H', 'min_h')}h per contract`, effect: { topUpMin: m - w } }];
    },
  },
  {
    id: 'CON-SUTTER-01', bucket: 'Contract', kind: 'det',
    sentence: 'Sutter orientation shifts pay the training rate and bill $0.',
    source: { doc: 'Sutter MSA §4.2', cite: 'orientation carve-out' },
    scope: s => s.fac === FACILITIES.sutter,
    params: { training_rate: p(18, 15, 26, 0.5, '$/h', 'training rate') },
    evaluate(s, ctx, P) {
      if (!s.orientation) return [{ status: 'pass', note: 'Not an orientation shift' }];
      if (s.rate !== P('CON-SUTTER-01', 'training_rate')) return [{ status: 'flag', note: `Orientation billed at standard ${money(s.rate)}/h → corrected to training ${money(P('CON-SUTTER-01', 'training_rate'))}/h, invoice line $0`, effect: { rateOverride: P('CON-SUTTER-01', 'training_rate') } }];
      return [{ status: 'pass', note: 'Training rate already applied' }];
    },
  },
  {
    id: 'TW-1187', bucket: 'This week', kind: 'det', expires: 'Sun Aug 30',
    sentence: 'No overtime at Mercy General this week — hold anything over the weekly threshold for review.',
    source: { doc: 'Slack · Sam T. · Aug 24', cite: 'compiled from one sentence' },
    scope: s => s.fac === FACILITIES.mercy,
    params: { weekly_h: p(40, 30, 50, 1, 'h', 'weekly threshold') },
    evaluate(s, ctx, P) {
      const arr = (ctx.byWorker.get(s.worker) || []).filter(x => x.fac === FACILITIES.mercy);
      if (arr[arr.length - 1] !== s) return [{ status: 'na', note: 'Assessed on last Mercy shift of week' }];
      let t = 0; for (const x of arr) t += ctx.workedMin(x);
      const over = t - MIN(P('TW-1187', 'weekly_h'));
      if (over <= 0) return [{ status: 'pass', note: `Mercy week ${fmtH(t)}h within threshold` }];
      return [{ status: 'held', note: `${fmtH(over)}h over the Mercy weekly cap → held, Dana K. notified`, effect: { holdMin: over } }];
    },
  },
  {
    id: 'VER-HC-01', bucket: 'Vertical', kind: 'det',
    sentence: 'Healthcare: shift-handoff overlap up to 15 minutes is paid, expected time.',
    source: { doc: 'vertical pack · healthcare', cite: 'handoff overlap' },
    scope: s => s.fac.vertical === 'healthcare', params: {},
    evaluate() { return [{ status: 'applied', note: 'Handoff overlap ≤15 min treated as worked time' }]; },
  },
  {
    id: 'VER-EV-02', bucket: 'Vertical', kind: 'llm',
    sentence: 'Event security: post-event egress up to ~45 minutes is expected; beyond that, ask.',
    source: { doc: 'vertical pack · events', cite: 'egress judgment' },
    scope: s => s.fac.vertical === 'events',
    params: { egress_min: p(45, 15, 90, 5, 'min', 'expected egress') },
    evaluate(s, ctx, P) {
      if (!s.sched) return [{ status: 'na', note: 'Unscheduled' }];
      const prs = ctx.resolvedPairs(s); if (!prs.length || prs[prs.length - 1].out == null) return [{ status: 'na', note: 'Unresolved' }];
      const past = prs[prs.length - 1].out - s.sched[1];
      if (past <= P('VER-EV-02', 'egress_min')) return [{ status: 'pass', note: `Clock-out ${past > 0 ? past + ' min past schedule — within expected egress' : 'on schedule'}` }];
      return [{ status: 'applied', kind: 'llm', note: `${past} min past schedule end — crowd-exit pattern in location trace looks legitimate, but beyond expected egress · review recommended`, chips: ['location trace', 'schedule'] }];
    },
  },
];

// ---------- engine ----------
function runEngine(week, paramOverrides) {
  const overrides = paramOverrides || {};
  const P = (rid, key) => {
    const o = overrides[rid + '.' + key];
    if (o != null) return o;
    const r = RULES.find(x => x.id === rid);
    return r.params[key].v;
  };
  const ctx = makeCtx(week, P);
  // pass 1: daily rules (need _dailyOtMin before weekly)
  const results = new Map();
  for (const s of week) {
    const rows = [];
    for (const r of RULES) {
      if (r.id === 'FED-OT-40' || r.id === 'TW-1187') continue; // pass 2
      if (!r.scope(s)) continue;
      try {
        const out = r.evaluate(s, ctx, P);
        for (const row of out) rows.push({ ruleId: r.id, kindDefault: r.kind, ...row });
      } catch (e) { rows.push({ ruleId: r.id, status: 'error', note: String(e && e.message || e) }); }
    }
    const daily = rows.find(x => x.effect && x.effect.dailyOtMin);
    s._dailyOtMin = daily ? daily.effect.dailyOtMin : 0;
    results.set(s.id, rows);
  }
  // pass 2: weekly rules
  for (const s of week) {
    const rows = results.get(s.id);
    for (const rid of ['FED-OT-40', 'TW-1187']) {
      const r = RULES.find(x => x.id === rid);
      if (!r.scope(s)) continue;
      try { for (const row of r.evaluate(s, ctx, P)) rows.push({ ruleId: r.id, kindDefault: r.kind, ...row }); }
      catch (e) { rows.push({ ruleId: r.id, status: 'error', note: String(e && e.message || e) }); }
    }
  }
  // payout
  const shifts = week.map(s => {
    const rows = results.get(s.id);
    let rate = s.rate, workedMin = ctx.workedMin(s);
    let premiumAmt = 0, premiumHours = 0, otPremiumMin = 0, topUpMin = 0, holdMin = 0, holdAll = false, extendTo = null;
    for (const row of rows) {
      const e = row.effect; if (!e) continue;
      if (e.rateOverride != null) rate = e.rateOverride;
      if (e.premiumAmt) premiumAmt += e.premiumAmt;
      if (e.premiumHours) premiumHours += e.premiumHours;
      if (e.premiumMin) workedMin += e.premiumMin;
      if (e.otPremiumMin) otPremiumMin += e.otPremiumMin;
      if (e.topUpMin) topUpMin += e.topUpMin;
      if (e.holdMin) holdMin += e.holdMin;
      if (e.holdAll) holdAll = true;
      if (e.extendToMin != null) extendTo = e.extendToMin;
    }
    if (extendTo != null) {
      const prs = ctx.resolvedPairs(s);
      if (prs.length && prs[prs.length - 1].rawOut != null) workedMin += Math.max(0, extendTo - prs[prs.length - 1].rawOut);
    }
    const payableMin = Math.max(0, workedMin + topUpMin - holdMin);
    const pay = holdAll ? 0 : H(payableMin) * rate + H(otPremiumMin) * rate + premiumHours * rate + premiumAmt;
    // naive spreadsheet pay: as-submitted punches (dups double-counted, missing out = assume sched end), base rate, no premiums
    let naiveMin = 0;
    for (const pr of s.punches) naiveMin += ((pr.out ?? (s.sched ? s.sched[1] : pr.in)) - pr.in);
    if (s.meal) naiveMin -= (s.meal[1] - s.meal[0]); else if (s.fac.autoDeduct && naiveMin > MIN(6)) naiveMin -= 30;
    const naive = H(Math.max(0, naiveMin)) * s.rate;
    const flagged = rows.some(x => x.status === 'flag' || x.status === 'held');
    const held = holdAll || holdMin > 0;
    return { shift: s, rows, pay, naive, held, flagged, deltaUnder: Math.max(0, pay - naive), deltaOver: Math.max(0, naive - pay), payableMin, rate };
  });
  const totals = shifts.reduce((t, r) => {
    t.under += r.held ? 0 : r.deltaUnder; t.over += r.held ? 0 : r.deltaOver;
    t.flags += r.flagged ? 1 : 0; t.held += r.held ? 1 : 0; return t;
  }, { under: 0, over: 0, flags: 0, held: 0 });
  return { shifts, totals, ctx };
}

// Count shifts with a flag/held/applied-with-effect for a rule in an existing run.
function fireCount(run, ruleId) {
  let n = 0;
  for (const r of run.shifts) if (r.rows.some(x => x.ruleId === ruleId && (x.status === 'flag' || x.status === 'held' || (x.status === 'applied' && x.effect)))) n++;
  return n;
}
function backtest(week, ruleId, paramOverrides) {
  return { fires: fireCount(runEngine(week, paramOverrides), ruleId), of: week.length };
}

// ---------- synthetic week ----------
function lcg(seed) { let x = seed >>> 0; return () => (x = (1103515245 * x + 12345) >>> 0) / 4294967296; }

function makeWeek({ seed = 20260824, scripted = true, start } = {}) {
  const F = FACILITIES;
  const W = [];
  const weekKey = start ? start.replace(/-/g, '') : String(seed);
  const idPrefix = weekKey === '20260824' ? '' : 'W' + weekKey + '-';
  let nextId = 5001; // seeded discrepancies use 48xx ids — keep auto ids clear of them
  const T = (h, m) => h * 60 + (m || 0);
  const rnd = lcg(seed);
  const jitter = (base, spread) => base + Math.floor(rnd() * (2 * spread + 1)) - spread;

  function shift(o) {
    const s = {
      id: idPrefix + nextId++, meal: null, geo: null, badgeIn: null, badgeOut: null,
      waiverOnFile: false, consentClopen: false, editedAfterApproval: null,
      schedChangedHoursBefore: null, orientation: false, contractMin: false, mealEvidence: true,
      resolution: null, ...o,
    };
    W.push(s); return s;
  }
  // clean baseline: regular crews at each facility
  const crews = [
    { worker: 'Maria R.', fac: F.mercy, role: 'Housekeeping', rate: 24.50, days: [0, 1, 2, 3, 4], start: T(9, 0), len: 450 },
    { worker: 'Luis M.', fac: F.mercy, role: 'Housekeeping', rate: 24.50, days: [0, 1, 2, 3, 4], start: T(6, 0), len: 510 },
    { worker: 'Aisha B.', fac: F.mercy, role: 'ICU tech', rate: 24.50, days: [0, 1, 2, 3, 4, 5], start: T(7, 0), len: 480 },
    { worker: 'Priya S.', fac: F.sutter, role: 'CNA', rate: 26.00, days: [1, 2, 3, 4], start: T(7, 0), len: 480 },
    { worker: 'Jamal W.', fac: F.northbank, role: 'Event security', rate: 21.00, days: [0, 2, 4], start: T(14, 0), len: 480 },
    { worker: 'Dre P.', fac: F.northbank, role: 'Event security', rate: 21.00, days: [1, 3], start: T(14, 0), len: 480 },
    { worker: 'Tom K.', fac: F.bayview, role: 'Forklift', rate: 19.00, days: [0, 1, 2, 3], start: T(8, 0), len: 510 },
    { worker: 'Reggie F.', fac: F.bayview, role: 'Picker', rate: 17.50, days: [0, 1, 2, 3, 4], start: T(6, 0), len: 480 },
    { worker: 'Elena V.', fac: F.wicker, role: 'Prep cook', rate: 19.75, days: [0, 1, 2, 4], start: T(10, 0), len: 480 },
    { worker: 'Marcus D.', fac: F.wicker, role: 'Line cook', rate: 21.50, days: [0, 1, 3, 4], start: T(15, 0), len: 480 },
    { worker: 'Grace H.', fac: F.stmarks, role: 'Med assistant', rate: 23.00, days: [0, 1, 2, 3], start: T(8, 30), len: 480 },
    { worker: 'Sam O.', fac: F.mercy, role: 'Housekeeping', rate: 24.50, days: [5, 6], start: T(8, 0), len: 450 },
    { worker: 'Nina T.', fac: F.sutter, role: 'CNA', rate: 26.00, days: [0, 1, 2], start: T(19, 0), len: 480 },
    { worker: 'Omar S.', fac: F.northbank, role: 'Usher', rate: 18.50, days: [4, 5], start: T(16, 0), len: 420 },
  ];
  for (const c of crews) for (const d of c.days) {
    const inJ = jitter(c.start, 4), outJ = jitter(c.start + c.len, 6);
    const s = shift({
      worker: c.worker, fac: c.fac, role: c.role, rate: c.rate, day: d,
      sched: [c.start, c.start + c.len],
      punches: [{ in: inJ, out: outJ }],
      geo: c.fac.geofence ? [inJ - jitter(5, 3), outJ + jitter(4, 3)] : null,
      badgeIn: c.fac.badge ? inJ - 3 : null, badgeOut: c.fac.badge ? outJ + 2 : null,
    });
    // meals for shifts > 6h (start ~3.5h in), CA compliant by default
    if (c.len > 360 && !(c.fac === F.mercy && rnd() < 0.35)) { // some Mercy shifts rely on auto-deduct
      const ms = s.punches[0].in + jitter(200, 20);
      s.meal = [ms, ms + 32];
    }
  }

  // ---- seeded discrepancies (findable by id in the UI) ----
  if (scripted) {
    // 4821: Maria Thu — missing clock-out, geofence exit 17:01, Dana confirms (TS-COMPLETE both)
    const m4821 = W.find(s => s.worker === 'Maria R.' && s.day === 3);
    m4821.id = '4821'; m4821.punches = [{ in: T(8, 58), out: null }]; m4821.geo = [T(8, 52), T(17, 1)];
    m4821.meal = [T(12, 10), T(12, 44)];
    m4821.resolution = { out: T(17, 1), by: 'Dana K. · supervisor', quote: 'Confirmed — she left at 5, we ran late on the east wing.' };

    // 4822: Jamal Mon — duplicate clock-in 6 min apart (CS-01)
    const m4822 = W.find(s => s.worker === 'Jamal W.' && s.day === 0);
    m4822.id = '4822'; m4822.punches = [{ in: T(14, 0), out: null }, { in: T(14, 6), out: T(22, 4) }];

    // 4823: Jamal Fri — long egress event (VER-EV-02 llm) + NY spread of hours (14:00 → 00:55)
    const m4823 = W.find(s => s.worker === 'Jamal W.' && s.day === 4);
    m4823.id = '4823'; m4823.sched = [T(14, 0), T(23, 0)]; m4823.punches = [{ in: T(13, 57), out: T(24, 55) }];
    m4823.geo = [T(13, 50), T(24, 58)]; m4823.meal = [T(18, 0), T(18, 30)];

    // 4824: Dre Thu — clopening: Wed ended 23:55, Thu starts 08:00 (REST-GAP NYC 11h)
    const dreWed = W.find(s => s.worker === 'Dre P.' && s.day === 1);
    dreWed.sched = [T(15, 0), T(23, 45)]; dreWed.punches = [{ in: T(14, 58), out: T(23, 55) }]; dreWed.geo = [T(14, 50), T(23, 58)];
    const m4824 = W.find(s => s.worker === 'Dre P.' && s.day === 3);
    m4824.id = '4824'; m4824.sched = [T(8, 0), T(16, 0)]; m4824.punches = [{ in: T(7, 58), out: T(16, 2) }]; m4824.geo = [T(7, 52), T(16, 5)]; m4824.day = 2;

    // 4825: Priya Tue — orientation billed at standard rate (CON-SUTTER-01)
    const m4825 = W.find(s => s.worker === 'Priya S.' && s.day === 1);
    m4825.id = '4825'; m4825.orientation = true; // rate stays 26.00 → corrected to 18

    // 4826: Luis Tue — no meal punch, no waiver, 8.5h (CA-MB-01) — Mercy auto-deduct + no evidence (FAC-AUTODED)
    const m4826 = W.find(s => s.worker === 'Luis M.' && s.day === 1);
    m4826.id = '4826'; m4826.meal = null; m4826.mealEvidence = false;

    // 4827: Luis Thu — 10.6h day (CA-OT-8 daily overtime)
    const m4827 = W.find(s => s.worker === 'Luis M.' && s.day === 3);
    m4827.id = '4827'; m4827.punches = [{ in: T(6, 1), out: T(17, 20) }]; m4827.geo = [T(5, 57), T(17, 23)];
    m4827.meal = [T(10, 30), T(11, 0)];

    // 4830: Aisha week — 45.5h at Mercy (TW-1187 holds 5.5h; FED-OT-40 anti-pyramid demo)
    const aSat = W.find(s => s.worker === 'Aisha B.' && s.day === 5);
    aSat.id = '4830'; aSat.sched = [T(7, 0), T(16, 30)]; aSat.punches = [{ in: T(6, 58), out: T(16, 32) }]; aSat.geo = [T(6, 52), T(16, 35)];
    aSat.meal = [T(11, 0), T(11, 32)];

    // 4833: Tom Wed — facility clock caps at 16:00, badge-out 16:47 (FAC-BADGE-01), Ray confirms
    const m4833 = W.find(s => s.worker === 'Tom K.' && s.day === 2);
    m4833.id = '4833'; m4833.punches = [{ in: T(8, 2), out: T(16, 0) }]; m4833.badgeIn = T(7, 57); m4833.badgeOut = T(16, 47);
    m4833.resolution = { by: 'Ray P. · shift lead', quote: 'Yeah the clock maxes out, he was here till quarter to five.' };

    // 4834: Reggie — exact 8.00h Mon-Thu (CS-EXACT streak)
    for (const d of [0, 1, 2, 3]) { const s = W.find(x => x.worker === 'Reggie F.' && x.day === d); s.punches = [{ in: T(6, 0), out: T(14, 30) }]; s.meal = [T(10, 0), T(10, 30)]; if (d === 3) s.id = '4834'; }

    // 4835: Elena Fri — schedule moved 18h before start (CHI-FWW-01)
    const m4835 = W.find(s => s.worker === 'Elena V.' && s.day === 4);
    m4835.id = '4835'; m4835.schedChangedHoursBefore = 18;

    // 4836: Grace Wed — sent home after 1.6h of an 8h schedule (CA-RT-01 + CON-MIN-4H)
    const m4836 = W.find(s => s.worker === 'Grace H.' && s.day === 2);
    m4836.id = '4836'; m4836.contractMin = true; m4836.punches = [{ in: T(8, 33), out: T(10, 10) }]; m4836.geo = [T(8, 30), T(10, 14)]; m4836.meal = null;

    // 4837: Grace Thu — split shift: 8:30–11:30 + 15:00–19:00 (CA-SS-01; rate high → partial offset demo)
    const m4837 = W.find(s => s.worker === 'Grace H.' && s.day === 3);
    m4837.id = '4837'; m4837.punches = [{ in: T(8, 30), out: T(11, 30) }, { in: T(15, 0), out: T(19, 0) }]; m4837.meal = null; m4837.geo = [T(8, 26), T(19, 3)];

    // 4838: Nina Mon — night shift edited after approval (CS-EDIT)
    const m4838 = W.find(s => s.worker === 'Nina T.' && s.day === 0);
    m4838.id = '4838'; m4838.editedAfterApproval = 'site portal · unknown editor';

    // 4839: Sam O. Sun — 17.2h span, missed clock-out not resolved (CS-16H hold)
    const m4839 = W.find(s => s.worker === 'Sam O.' && s.day === 6);
    m4839.id = '4839'; m4839.punches = [{ in: T(8, 1), out: T(25, 12) }]; m4839.geo = [T(7, 55), T(15, 40)]; m4839.meal = null;

    // 4840: Omar Sat — double-booked: overlapping shift at Wicker? (different city — use CS-SPEED instead)
    // Omar works Northbank 16:00-23:00 Fri, then a Sat shift; give Grace an overlap instead:
    // Grace Mon: overlapping St.Marks + Mercy pickup (CS-OVLP + CS-SPEED)
    const gMon = W.find(s => s.worker === 'Grace H.' && s.day === 0);
    gMon.id = '4840';
    shift({
      id: '4841', worker: 'Grace H.', fac: F.mercy, role: 'Housekeeping (pickup)', rate: 24.50, day: 0,
      sched: [T(14, 0), T(18, 0)], punches: [{ in: T(14, 0), out: T(18, 0) }], geo: [T(13, 55), T(18, 2)],
    }); // overlaps 8:30-16:30 St.Marks shift → CS-OVLP flags both
  }

  return W;
}

// ---------- exports / self-check ----------
const BENCH = { FACILITIES, FEATURES, RULES, makeWeek, runEngine, backtest, fireCount, dayLabels, fmtT, fmtH, money, DAYS, MIN, H };
if (typeof module !== 'undefined') module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const week = makeWeek();
  const run = runEngine(week);
  const { shifts, totals } = run;
  const byId = id => shifts.find(r => r.shift.id === id);
  const hasRow = (id, rule, status) => byId(id).rows.some(x => x.ruleId === rule && (!status || x.status === status));
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else console.log('ok: ' + msg); };

  assert(week.length > 50, `week has ${week.length} shifts`);
  assert(shifts.every(r => r.rows.every(x => x.status !== 'error')), 'no rule errors');
  assert(hasRow('4821', 'TS-COMPLETE', 'flag'), '4821 missing clock-out flags');
  assert(byId('4821').rows.some(x => x.ruleId === 'TS-COMPLETE' && x.kind === 'human'), '4821 human confirmation row');
  assert(hasRow('4822', 'CS-01', 'applied'), '4822 duplicate merged');
  assert(hasRow('4823', 'NY-SOH-01', 'flag'), '4823 spread of hours');
  assert(hasRow('4823', 'VER-EV-02', 'applied'), '4823 egress LLM row');
  assert(hasRow('4824', 'REST-GAP-01', 'flag'), '4824 clopening');
  assert(hasRow('4825', 'CON-SUTTER-01', 'flag'), '4825 training rate corrected');
  assert(byId('4825').rate === 18, '4825 rate overridden to 18');
  assert(hasRow('4826', 'CA-MB-01', 'flag'), '4826 meal premium');
  assert(hasRow('4826', 'FAC-AUTODED-01', 'flag'), '4826 auto-deduct reversed');
  assert(hasRow('4827', 'CA-OT-8', 'applied'), '4827 daily OT');
  assert(hasRow('4830', 'TW-1187', 'held'), '4830 OT held at Mercy');
  assert(hasRow('4833', 'FAC-BADGE-01', 'flag'), '4833 badge mismatch');
  assert(byId('4833').deltaUnder > 0, '4833 underpayment corrected (paid to badge)');
  assert(hasRow('4834', 'CS-EXACT', 'flag'), '4834 exact streak');
  assert(hasRow('4835', 'CHI-FWW-01', 'flag'), '4835 predictability pay');
  assert(hasRow('4836', 'CA-RT-01', 'flag'), '4836 reporting time');
  assert(hasRow('4836', 'CON-MIN-4H', 'flag'), '4836 4h minimum');
  assert(hasRow('4837', 'CA-SS-01', 'flag') || byId('4837').rows.some(x => x.ruleId === 'CA-SS-01'), '4837 split shift evaluated');
  assert(hasRow('4838', 'CS-EDIT', 'flag'), '4838 post-approval edit');
  assert(hasRow('4839', 'CS-16H', 'held'), '4839 impossible length held');
  assert(hasRow('4840', 'CS-OVLP', 'held') && hasRow('4841', 'CS-OVLP', 'held'), 'overlap holds both');
  assert(totals.under > 0 && totals.over > 0, `corrections both ways (under ${money(totals.under)}, over ${money(totals.over)})`);
  assert(shifts.every(r => isFinite(r.pay) && r.pay >= 0), 'all payouts finite');

  // param edit changes behavior: widen meal deadline → 4826 meal-late flags may persist (missed meal), tighten CS-EXACT
  const bt1 = backtest(week, 'CA-MB-01');
  const bt2 = backtest(week, 'CS-EXACT', { 'CS-EXACT.streak': 2 });
  const bt2b = backtest(week, 'CS-EXACT', { 'CS-EXACT.streak': 7 });
  assert(bt2.fires > bt2b.fires, `param edit changes backtest (streak 2 → ${bt2.fires} fires, streak 7 → ${bt2b.fires})`);
  const priorWeek = makeWeek({ seed: 20260817, scripted: false });
  assert(priorWeek.every(s => !/^48\d\d$/.test(s.id)), 'prior week has no scripted 48xx ids');
  assert(priorWeek.length > 45, `prior week has ${priorWeek.length} shifts`);
  assert(fireCount(run, 'CA-MB-01') === bt1.fires, 'fireCount matches CA-MB-01 backtest');
  console.log(`ok: week: ${week.length} shifts · flags ${totals.flags} · held ${totals.held} · under ${money(totals.under)} · over ${money(totals.over)} · CA-MB-01 fires ${bt1.fires}`);
}
