import { Building2 } from 'lucide-react'
import { useOnboarding, type Onboarding, type PayrollProfile } from '@/lib/onboarding'
import { cycleLine } from '@/lib/cohorts'
import './profile.css'

function profileText(value: PayrollProfile[keyof PayrollProfile]) {
  return typeof value === 'string' ? value : value ? Object.entries(value).map(([key, text]) => `${key}: ${text}`).join(' · ') : ''
}

function ProfileRow({ title, value }: { title: string; value: string }) {
  return <div className="profile-card-row">
    <dt>{title}</dt>
    <dd key={value} className={value ? 'profile-value-arrived' : undefined}>{value || <span className="tag profile-not-yet">Not Yet</span>}</dd>
  </div>
}

/** The same live readout appears before the conversation and on the finished profile. */
export function ProfileCard({ state: supplied, className = '' }: { state?: Onboarding; className?: string }) {
  const [stored] = useOnboarding()
  const state = supplied ?? stored
  const { firm, profile, covered, authority, sources } = state
  const source = (set: 1 | 2) => sources.filter((item) => item.set === set).map((item) => item.label).join(' · ')
  const calendar = covered.includes('calendar') ? cycleLine({ ...state, name: '' }).replace(/^ · /, '') : ''
  const own = state.authorityConfigured ? authority.autoFix
    ? `Up to $${authority.limit.toLocaleString()} per entry · $${authority.weeklyCap.toLocaleString()} per week`
    : 'Check with me before making changes' : ''
  return <article className={`payroll-profile-card ${className}`} aria-label="Payroll profile preview" aria-live="polite">
    <header className="profile-card-firm">
      <span className="profile-favicon" aria-hidden="true">
        <Building2 size={22} />{firm?.icon && <img src={firm.icon} alt="" onError={(event) => { event.currentTarget.hidden = true }} />}
      </span>
      <div><p>Payroll profile</p><h2>{firm?.name || 'Your firm'}</h2>
        {firm && <span className="profile-firm-details">{[firm.states.join(', '), firm.verticals.join(' · ')].filter(Boolean).join(' · ')}</span>}
      </div>
    </header>
    <dl>
      <ProfileRow title="Pay calendar" value={calendar} />
      <ProfileRow title="How worker hours arrive" value={profileText(profile.workerHours) || source(1)} />
      <ProfileRow title="How client-approved hours arrive" value={profileText(profile.clientHours) || source(2)} />
      <ProfileRow title="Whose hours we pay" value={profileText(profile.whoseHours)} />
      <ProfileRow title="Rates and client rules" value={profileText(profile.ratesWhere)} />
      <ProfileRow title="Pay complaints" value={profileText(profile.complaints)} />
      <ProfileRow title="What I fix on my own" value={own} />
    </dl>
  </article>
}
