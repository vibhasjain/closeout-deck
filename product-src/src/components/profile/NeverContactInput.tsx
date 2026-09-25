import { useId, useState } from 'react'
import { Plus, X } from 'lucide-react'
import './profile.css'

/** Names are persisted by the parent immediately; Enter and the plus button add one. */
export function NeverContactInput({ value, onChange, disabled = false }: { value: string[]; onChange(value: string[]): void; disabled?: boolean }) {
  const [draft, setDraft] = useState('')
  const id = useId()
  function add() {
    const name = draft.trim().slice(0, 200)
    if (!name || disabled) return
    if (!value.some((item) => item.toLowerCase() === name.toLowerCase())) onChange([...value, name])
    setDraft('')
  }
  return <div className="never-contact-input">
    <div className="never-contact-tokens">
    {value.length > 0 && <ul aria-label="Never contact">{value.map((name) => <li key={name}>
      <span>{name}</span><button className="profile-icon-button" type="button" aria-label={`Remove ${name}`} disabled={disabled} onClick={() => onChange(value.filter((item) => item !== name))}><X size={14} /></button>
    </li>)}</ul>}
    <div className="profile-add-line">
      <input id={id} className="q-input" aria-label="Name to never contact" placeholder={value.length ? 'Add another name…' : 'Add a name…'} value={draft} disabled={disabled} maxLength={200} onChange={(event) => setDraft(event.target.value)} onBlur={add} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); add() }
        if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
      }} />
      <button type="button" className="btn profile-icon-button" aria-label="Add name" disabled={disabled || !draft.trim()} onClick={add}><Plus size={17} /></button>
    </div>
    </div>
    <p className="never-contact-hint">Names, one at a time. Press Enter to add.</p>
  </div>
}
