import { useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ProfileDialog } from './ProfileDialog'
import { ProfileEditor } from './ProfileEditor'
import { RulebookModal } from './RulebookModal'

const sections = [
  ['firm', 'The firm'], ['calendar', 'Pay calendar'], ['workerHours', 'Worker hours'],
  ['clientHours', 'Approved hours'], ['whoseHours', 'Whose hours we pay'], ['ratesWhere', 'Rates and client rules'],
  ['complaints', 'Pay complaints'], ['authority', 'Permissions'], ['notes', 'Notes'],
]

export function ProfileModal({ onClose }: { onClose(): void }) {
  const [rulebook, setRulebook] = useState(false)
  const [active, setActive] = useState('firm')
  const content = useRef<HTMLDivElement>(null)
  if (rulebook) return <RulebookModal initialSection="authority" onClose={() => setRulebook(false)} />
  return <ProfileDialog title="Your profile" description="Everything here is editable, and saves as you change it." onClose={onClose} className="profile-editor-modal">
    <div className="profile-editor-modal-body">
      <nav className="profile-section-rail" aria-label="Profile sections">{sections.map(([id, label]) => <button key={id} type="button" aria-current={active === id ? 'location' : undefined} onClick={() => {
        setActive(id)
        content.current?.querySelector(`#profile-${id}`)?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      }}><ChevronRight size={14} aria-hidden /><span>{label}</span></button>)}</nav>
      <div className="profile-modal-body" ref={content} onScroll={() => {
        if (!content.current) return
        const top = content.current.getBoundingClientRect().top + 140
        const current = [...sections].reverse().find(([id]) => (content.current?.querySelector(`#profile-${id}`)?.getBoundingClientRect().top ?? Infinity) <= top)
        if (current) setActive(current[0])
      }}><ProfileEditor onEditRulebook={() => setRulebook(true)} /></div>
    </div>
  </ProfileDialog>
}
