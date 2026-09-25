import { useState } from 'react'
import { ProfileDialog } from './ProfileDialog'
import { ProfileEditor } from './ProfileEditor'
import { RulebookModal } from './RulebookModal'

export function ProfileModal({ onClose }: { onClose(): void }) {
  const [rulebook, setRulebook] = useState(false)
  if (rulebook) return <RulebookModal initialSection="authority" onClose={() => setRulebook(false)} />
  return <ProfileDialog title="Your Payroll profile" description="Everything here is editable, and saves as you change it." onClose={onClose}>
    <div className="profile-modal-body"><ProfileEditor onEditRulebook={() => setRulebook(true)} /></div>
  </ProfileDialog>
}
