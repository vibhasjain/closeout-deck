import { Building2 } from 'lucide-react'
import { useOnboarding, type Onboarding } from '@/lib/onboarding'
import { allowedModelUrl } from '@/lib/chatActions'
import { cycleLine } from '@/lib/cohorts'
import { payrollFirmName } from '@/lib/firmName'
import { profileAuthoritySummary, profileSummary } from './profileSummary'
import './profile.css'

function ProfileRow({ title, value, complete = false }: { title: string; value: string; complete?: boolean }) {
  return <div className={`profile-card-row${complete ? ' profile-card-row-complete' : ''}`}>
    <dt>{title}</dt>
    <dd key={value} className={value ? 'profile-value-arrived' : undefined}>{value || <span className="tag profile-not-yet">Not Yet</span>}</dd>
  </div>
}

/** The same live readout appears before the conversation and on the finished profile. */
export function ProfileCard({ state: supplied, className = '', compact = false }: { state?: Onboarding; className?: string; compact?: boolean }) {
  const [stored] = useOnboarding()
  const state = supplied ?? stored
  const { firm, profile, covered, sources } = state
  const icon = firm?.icon ? allowedModelUrl(firm.icon, firm, true) : null
  const source = (set: 1 | 2) => sources.filter((item) => item.set === set).map((item) => item.label).join(' · ')
  const calendar = covered.includes('calendar') ? cycleLine({ ...state, name: '' }).replace(/^ · /, '') : ''
  const own = profileAuthoritySummary(state)
  return <article className={`payroll-profile-card${compact ? ' profile-card-compact' : ''} ${className}`} aria-label="Payroll profile preview" aria-live="polite">
    {firm?.domain === 'sample' && <span className="tag profile-sample">Sample</span>}
    <header className="profile-card-firm">
      <span className="profile-favicon" aria-hidden="true">
        <Building2 size={22} />{icon && <img src={icon} alt="" onError={(event) => { event.currentTarget.hidden = true }} />}
      </span>
      <div><h2>{payrollFirmName(firm)}</h2><p>Payroll profile</p>
        {firm && <span className="profile-firm-details">{[firm.states.join(', '), firm.verticals.join(' · ')].filter(Boolean).join(' · ')}</span>}
      </div>
    </header>
    {!compact && <dl>
      <ProfileRow title="Pay calendar" value={calendar} />
      <ProfileRow title="How worker hours arrive" value={profileSummary(profile.workerHours) || source(1)} />
      <ProfileRow title="How client-approved hours arrive" value={profileSummary(profile.clientHours) || source(2)} />
      <ProfileRow title="Whose hours we pay" value={profileSummary(profile.whoseHours)} />
      <ProfileRow title="Rates and client rules" value={profileSummary(profile.ratesWhere)} />
      <ProfileRow title="Pay complaints" value={profileSummary(profile.complaints)} />
      <ProfileRow title="What I fix on my own" value={own} complete />
    </dl>}
  </article>
}
