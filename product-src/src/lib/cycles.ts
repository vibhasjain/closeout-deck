export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const byWeekday = (day: string) => WEEKDAYS.indexOf(day as (typeof WEEKDAYS)[number])
export const isMonthly = (f: string) => f === 'Semi-monthly' || f === 'Monthly'
/** 1st, 15th, last day. 0 means the last day of the month. */
export const ordinal = (n: number) =>
  n === 0 ? 'last day' : `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4)] ?? 'th'}`

export interface Cycle {
  id: string
  start: Date
  /** Pay period end: the last day of work included in the run. */
  end: Date
  /** Timesheet cutoff: when approved hours must be in. */
  cutoff: Date
  /** Payroll processing deadline: last point a correction makes this run. */
  deadline: Date
  payDate: Date
  status: 'in-progress' | 'needs-review' | 'reviewed'
}

export interface Calendar {
  frequency: 'Weekly' | 'Biweekly' | 'Semi-monthly' | 'Monthly'
  periodEndDay: (typeof WEEKDAYS)[number]
  payDay: (typeof WEEKDAYS)[number]
  payDatesOfMonth: number[]
  cutoffDays: number
  deadlineDays: number
}

const day = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const lastOfMonth = (y: number, m: number) => new Date(y, m + 1, 0)
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const nextWeekdayAfter = (d: Date, name: string) => day(d, (byWeekday(name) - d.getDay() + 7) % 7 || 7)

/** Semi-monthly closes on the 15th and the last day; monthly on the last day. */
const boundaries = (y: number, m: number, frequency: string) =>
  frequency === 'Monthly' ? [lastOfMonth(y, m)] : [new Date(y, m, 15), lastOfMonth(y, m)]

/** Monthly runs once a month, semi-monthly twice, whatever is left over in the stored pair. */
const payDatesFor = (cal: Calendar) => cal.payDatesOfMonth.slice(0, cal.frequency === 'Monthly' ? 1 : 2)

/** First configured pay date strictly after the period closes. 0 means the last day of the month. */
function monthlyPayDateAfter(end: Date, daysOfMonth: number[]): Date {
  for (let k = 0; k < 3; k++) {
    const y = end.getFullYear()
    const m = end.getMonth() + k
    const resolved = daysOfMonth
      .map((d) => (d === 0 ? lastOfMonth(y, m).getDate() : d))
      .sort((a, b) => a - b)
    for (const dom of resolved) {
      const candidate = new Date(y, m, Math.min(dom, lastOfMonth(y, m).getDate()))
      if (candidate > end) return candidate
    }
  }
  return end
}

function periodEnds(cal: Calendar, count: number, today: Date): Date[] {
  if (isMonthly(cal.frequency)) {
    const all: Date[] = []
    for (let k = 1; k >= -Math.ceil(count / 2) - 2; k--) {
      const base = new Date(today.getFullYear(), today.getMonth() + k, 1)
      all.push(...boundaries(base.getFullYear(), base.getMonth(), cal.frequency))
    }
    all.sort((a, b) => a.getTime() - b.getTime())
    const open = all.findIndex((d) => d >= today)
    return all.slice(Math.max(0, open - count + 1), open + 1).reverse()
  }
  const step = cal.frequency === 'Weekly' ? 7 : 14
  const ends: Date[] = []
  let end = nextWeekdayAfter(day(today, -1), cal.periodEndDay)
  while (ends.length < count) {
    ends.push(end)
    end = day(end, -step)
  }
  return ends
}

/** The `count` most recent pay periods, newest first. The newest is the one still open today. */
export function recentCycles(cal: Calendar, count = 6, today = midnight(new Date())): Cycle[] {
  const ends = periodEnds(cal, count + 1, today)
  return ends.slice(0, count).map((end, i) => {
    const previous = ends[i + 1]
    const payDate = isMonthly(cal.frequency)
      ? monthlyPayDateAfter(end, payDatesFor(cal))
      : nextWeekdayAfter(end, cal.payDay)
    return {
      id: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
      start: previous ? day(previous, 1) : day(end, -6),
      end,
      cutoff: day(end, cal.cutoffDays),
      deadline: day(payDate, -cal.deadlineDays),
      payDate,
      status: end >= today ? 'in-progress' : i === 1 ? 'needs-review' : 'reviewed',
    }
  })
}

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', opts)

export const cycleLabel = (c: Cycle) =>
  c.start.getMonth() === c.end.getMonth()
    ? `${fmt(c.start, { month: 'short', day: 'numeric' })} to ${fmt(c.end, { day: 'numeric' })}`
    : `${fmt(c.start, { month: 'short', day: 'numeric' })} to ${fmt(c.end, { month: 'short', day: 'numeric' })}`

export const shortDate = (d: Date) => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' })

/** One-line description of the payroll calendar, in the terms payroll ops use. */
export function calendarSummary(cal: Calendar): string {
  const paid = isMonthly(cal.frequency)
    ? `paid the ${payDatesFor(cal).map(ordinal).join(' and ')}`
    : `paid ${cal.payDay}`
  const ends = isMonthly(cal.frequency)
    ? cal.frequency === 'Monthly' ? 'periods end the last day' : 'periods end the 15th and last day'
    : `periods end ${cal.periodEndDay}`
  return `${cal.frequency} · ${paid} · ${ends}`
}

// ponytail: semi-monthly and monthly periods are stitched from 7-day engine weeks; day labels come from dayLabels(blockStart)
export function cycleWeeks(c: Cycle): string[] {
  const starts: string[] = []
  for (let start = midnight(c.start); start <= c.end; start = day(start, 7)) {
    starts.push(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`)
  }
  return starts
}
