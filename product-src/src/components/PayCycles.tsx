import { useState } from 'react'
import { CycleFields } from '@/components/PayrollCalendar'
import { Btn } from '@/components/ui'
import { cycleError, cycleLine, removeCycle, saveCycle, type CycleDraft } from '@/lib/cohorts'
import { useOnboarding } from '@/lib/onboarding'
import './payroll-calendar.css'

/** Add or edit one additional pay cycle. `id` is the cycle being edited, or null for a new one named `name`. */
export function PayCycleForm({ id, name = '', onClose }: { id: string | null; name?: string; onClose(): void }) {
  const [state, update] = useOnboarding()
  const editing = state.cohorts.find((cohort) => cohort.id === id)
  const [draft, setDraft] = useState<CycleDraft>(() => editing ?? {
    name, frequency: state.frequency, periodEndDay: state.periodEndDay, payDay: state.payDay, payDatesOfMonth: [...state.payDatesOfMonth] })
  const [error, setError] = useState('')

  function save() {
    const why = cycleError(state.cohorts, draft.name, editing?.id)
    if (why) { setError(why); return }
    update({ cohorts: saveCycle(state.cohorts, draft, editing?.id) })
    onClose()
  }

  return (
    <form className="pay-cycle-form" aria-label={editing ? `Edit ${editing.name}` : 'Add pay cycle'} noValidate
      onSubmit={(event) => { event.preventDefault(); save() }}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }}>
      <div className="calendar-fields payroll-calendar">
        <label className="calendar-field pay-cycle-name">
          <span className="lbl">Who's on it</span>
          <input className="q-input w-full" autoFocus value={draft.name} placeholder="E.g. Clerical, or Mercy General"
            aria-invalid={Boolean(error)} aria-describedby={error ? 'pay-cycle-error' : undefined}
            onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError('') }} />
          {error && <span className="pay-cycle-error" id="pay-cycle-error" role="alert">{error}</span>}
        </label>
        <CycleFields value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} idPrefix="cycle-" />
      </div>
      <div className="pay-cycle-actions">
        <Btn type="submit" className="primary">{editing ? 'Save' : 'Add'}</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
        {editing && <Btn className="ghost pay-cycle-remove" onClick={() => { update({ cohorts: removeCycle(state.cohorts, editing.id) }); onClose() }}>Remove</Btn>}
      </div>
    </form>
  )
}

/** Additional pay cycles beside the main calendar, one line each, with an inline form to add or edit. */
export function PayCycles() {
  const [state, update] = useOnboarding()
  const [open, setOpen] = useState<string | null | undefined>()

  return (
    <div className="pay-cycles">
      {state.cohorts.length === 0 && open === undefined && <p className="r-note">Everyone is on the main cycle.</p>}
      {state.cohorts.length > 0 && <ul className="pay-cycle-list">
        {state.cohorts.map((cohort) => <li key={cohort.id}>
          {open === cohort.id ? <PayCycleForm id={cohort.id} onClose={() => setOpen(undefined)} /> : <>
            <span className="pay-cycle-line">{cycleLine(cohort)}</span>
            <span className="pay-cycle-row-actions">
              <Btn className="ghost" aria-label={`Edit ${cohort.name}`} onClick={() => setOpen(cohort.id)}>Edit</Btn>
              <Btn className="ghost" aria-label={`Remove ${cohort.name}`} onClick={() => update({ cohorts: removeCycle(state.cohorts, cohort.id) })}>Remove</Btn>
            </span>
          </>}
        </li>)}
      </ul>}
      {open === null ? <PayCycleForm id={null} onClose={() => setOpen(undefined)} />
        : <Btn className="pay-cycle-add" onClick={() => setOpen(null)}>Add pay cycle</Btn>}
    </div>
  )
}
