import { DAYS_OF_MONTH, FREQUENCIES, WEEKDAYS, byWeekday, isMonthly, useOnboarding, type Onboarding } from '@/lib/onboarding'
import { ordinal } from '@/lib/utils'
import './payroll-calendar.css'

const field = 'calendar-field'
const hint = 'r-note'

const shiftWeekday = (name: string, n: number) => WEEKDAYS[(((byWeekday(name) + n) % 7) + 7) % 7]
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Cycle = Pick<Onboarding, 'frequency' | 'periodEndDay' | 'payDay' | 'payDatesOfMonth'>

/** Frequency, then pay dates or pay day and period end. Shared by the main calendar and each additional pay cycle. */
export function CycleFields({ value, onChange, idPrefix = '' }: { value: Cycle; onChange(patch: Partial<Cycle>): void; idPrefix?: string }) {
  function setFrequency(frequency: Onboarding['frequency']) {
    const dates = frequency === 'Monthly' ? [value.payDatesOfMonth[0] ?? 5] : [value.payDatesOfMonth[0] ?? 20, value.payDatesOfMonth[1] ?? 5]
    onChange({ frequency, payDatesOfMonth: isMonthly(frequency) ? dates : value.payDatesOfMonth })
  }

  function setPayDate(index: number, date: number) {
    const next = [...value.payDatesOfMonth]
    next[index] = date
    onChange({ payDatesOfMonth: next })
  }

  return (
    <>
      <label className={field}>
        <span className="lbl">Pay frequency</span>
        <select className="q-input w-full" id={`${idPrefix}frequency`} value={value.frequency} onChange={(e) => setFrequency(e.target.value as Onboarding['frequency'])}>
          {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
        </select>
        <span className={hint}>Biweekly is 26 runs a year. Semi-monthly is 24.</span>
      </label>

      {isMonthly(value.frequency) ? (
        <label className={field}>
          <span className="lbl">{value.frequency === 'Monthly' ? 'Pay date of month' : 'Pay dates of month'}</span>
          <span className="date-pair">
            {(value.frequency === 'Monthly' ? [0] : [0, 1]).map((i) => (
              <select
                className="q-input w-full"
                key={i}
                id={`${idPrefix}paydate-${i}`}
                aria-label={value.frequency === 'Monthly' ? undefined : i === 0 ? 'First pay date' : 'Second pay date'}
                value={String(value.payDatesOfMonth[i] ?? 5)}
                onChange={(e) => setPayDate(i, Number(e.target.value))}
              >
                {DAYS_OF_MONTH.map((d) => <option key={d} value={d}>{d === 0 ? 'Last day' : ordinal(d)}</option>)}
              </select>
            ))}
          </span>
          <span className={hint}>
            Periods end {value.frequency === 'Monthly' ? 'the last day of the month' : 'the 15th and the last day'}
          </span>
        </label>
      ) : (
        <>
          <label className={field}>
            <span className="lbl">Pay date</span>
            <select className="q-input w-full" id={`${idPrefix}payday`} value={value.payDay} onChange={(e) => onChange({ payDay: e.target.value as Onboarding['payDay'] })}>
              {WEEKDAYS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <span className={hint}>The day funds reach workers</span>
          </label>

          <label className={field}>
            <span className="lbl">Pay period end</span>
            <select className="q-input w-full" id={`${idPrefix}period-end`} value={value.periodEndDay} onChange={(e) => onChange({ periodEndDay: e.target.value as Onboarding['periodEndDay'] })}>
              {WEEKDAYS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <span className={hint}>Last day of work included in the run</span>
          </label>
        </>
      )}
    </>
  )
}

/** The payroll calendar, in the terms payroll ops use. Shared by onboarding and Settings. */
export function PayrollCalendar() {
  const [state, update] = useOnboarding()
  const monthly = isMonthly(state.frequency)

  return (
    <div className="calendar-fields payroll-calendar">
      <CycleFields value={state} onChange={update} />

      <label className={field}>
        <span className="lbl">Timesheet cutoff</span>
        <select className="q-input w-full" id="cutoff-days" value={String(state.cutoffDays)} onChange={(e) => update({ cutoffDays: Number(e.target.value) })}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n === 0 ? 'Same day as period end' : `${plural(n, 'day')} after period end`}</option>)}
        </select>
        <span className={hint}>
          When approved hours must be in
          {!monthly && `, so ${shiftWeekday(state.periodEndDay, state.cutoffDays)}`}
        </span>
      </label>

      <label className={field}>
        <span className="lbl">Payroll processing deadline</span>
        <select className="q-input w-full" id="deadline-days" value={String(state.deadlineDays)} onChange={(e) => update({ deadlineDays: Number(e.target.value) })}>
          {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? 'Same day as pay date' : `${plural(n, 'day')} before pay date`}</option>)}
        </select>
        <span className={hint}>
          Last point a correction makes this run
          {!monthly && `, so ${shiftWeekday(state.payDay, -state.deadlineDays)}`}. After this it is a retro adjustment next cycle, or an off-cycle payment.
        </span>
      </label>
    </div>
  )
}
