import { useState } from 'react'
import { ProfileEditor } from '@/components/profile/ProfileEditor'
import { RulebookModal } from '@/components/profile/RulebookModal'
import { PageTitle } from '@/components/shell/PageTitle'
import './profile.css'

export function Profile() {
  const [rulebook, setRulebook] = useState(false)
  return <div className="payroll-profile-page">
    <PageTitle title="Payroll profile" description="What your Closeout Agent reads before every pay run." right={<button type="button" className="btn" onClick={() => setRulebook(true)}>View Rulebook</button>} />
    <div className="payroll-profile-page-content"><p className="payroll-profile-save-note">Everything here saves as you change it.</p><ProfileEditor onEditRulebook={() => setRulebook(true)} /></div>
    {rulebook && <RulebookModal onClose={() => setRulebook(false)} />}
  </div>
}
