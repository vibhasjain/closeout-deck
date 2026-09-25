import { PayrollCalendar, CycleFields } from '@/components/PayrollCalendar'
import { getOnboarding, useOnboarding, type FirmFacts, type ProfileField, type ProfileValue } from '@/lib/onboarding'
import './profile.css'

const profileSections: { field: ProfileField; title: string; placeholder: string }[] = [
  { field: 'workerHours', title: 'How worker hours arrive', placeholder: 'How your team gets worker-reported hours' },
  { field: 'clientHours', title: 'How client-approved hours arrive', placeholder: 'How approved hours reach your team' },
  { field: 'whoseHours', title: 'Whose hours we pay', placeholder: 'Which hours to use when sources disagree' },
  { field: 'ratesWhere', title: 'Rates and client rules', placeholder: 'Where rates and client rules live' },
  { field: 'complaints', title: 'Pay complaints', placeholder: 'Where complaints arrive and who picks them up' },
]

function ValueEditor({ value, placeholder, onChange }: { value?: ProfileValue; placeholder: string; onChange(value: ProfileValue): void }) {
  if (value && typeof value === 'object') return <div className="profile-field-stack">{Object.entries(value).map(([key, text]) =>
    <textarea key={key} className="q-input profile-textarea" aria-label={`${placeholder}: ${key}`} placeholder={key} maxLength={200} value={text} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />)}</div>
  return <textarea className="q-input profile-textarea" aria-label={placeholder} placeholder={placeholder} maxLength={200} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
}

/** The full page and modal share the same fields, and each change saves immediately. */
export function ProfileEditor({ onEditRulebook }: { onEditRulebook(): void }) {
  const [state, update] = useOnboarding()
  const firm = state.firm
  function changeFirm(patch: Partial<FirmFacts>) {
    const current = getOnboarding().firm ?? { name: '', summary: '', states: [], verticals: [], clientTypes: [], size: '', staffing: true }
    update({ firm: { ...current, ...patch } })
  }
  function changeProfile(field: ProfileField, value: ProfileValue) {
    update({ profile: { ...getOnboarding().profile, [field]: value } })
  }
  return <div className="payroll-profile-editor">
    <section className="profile-edit-section"><h3>The firm</h3>
      <div className="profile-field-stack">
        <input className="q-input" aria-label="Firm name" placeholder="Firm name" value={firm?.name ?? ''} maxLength={200} onChange={(event) => changeFirm({ name: event.target.value })} />
        <textarea className="q-input profile-textarea" aria-label="Firm summary" placeholder="What your firm does" value={firm?.summary ?? ''} maxLength={200} onChange={(event) => changeFirm({ summary: event.target.value })} />
        <input className="q-input" aria-label="States" placeholder="States, separated by commas" defaultValue={firm?.states.join(', ') ?? ''} maxLength={200} onChange={(event) => changeFirm({ states: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} />
        <input className="q-input" aria-label="Verticals" placeholder="Verticals, separated by commas" defaultValue={firm?.verticals.join(', ') ?? ''} maxLength={200} onChange={(event) => changeFirm({ verticals: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} />
      </div>
    </section>
    <section className="profile-edit-section"><h3>Pay calendar</h3><div onChange={() => {
      const current = getOnboarding()
      if (!current.covered.includes('calendar')) update({ covered: [...current.covered, 'calendar'] })
    }}><PayrollCalendar />
      {state.cohorts.map((cohort) => <div className="profile-cohort" key={cohort.id}>
        <h4>{cohort.name}</h4><div className="calendar-fields payroll-calendar"><CycleFields idPrefix={`profile-${cohort.id}-`} value={cohort} onChange={(patch) => update({ cohorts: state.cohorts.map((item) => item.id === cohort.id ? { ...item, ...patch } : item) })} /></div>
      </div>)}</div>
      <ValueEditor value={state.profile.payrollRunBy} placeholder="Who runs Payroll" onChange={(value) => changeProfile('payrollRunBy', value)} />
    </section>
    {profileSections.map(({ field, title, placeholder }) => <section className="profile-edit-section" key={field}>
      <h3>{title}</h3><ValueEditor value={state.profile[field]} placeholder={placeholder} onChange={(value) => changeProfile(field, value)} />
    </section>)}
    <section className="profile-edit-section"><h3>What I fix on my own</h3>
      <p>{state.authorityConfigured ? state.authority.autoFix
        ? `Fix up to $${state.authority.limit.toLocaleString()} per entry, within $${state.authority.weeklyCap.toLocaleString()} each week.`
        : 'Approval required before every change.' : 'Configure permission to make changes in your Rulebook.'}</p>
      <button className="btn" type="button" onClick={onEditRulebook}>Edit in Rulebook</button>
    </section>
    <section className="profile-edit-section"><h3>Notes</h3><ValueEditor value={state.profile.notes} placeholder="Additional Payroll details" onChange={(value) => changeProfile('notes', value)} /></section>
  </div>
}
