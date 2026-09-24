import { useId, useState } from 'react'
import { Check, FileSpreadsheet, Mail } from 'lucide-react'
import { Btn } from '@/components/ui'
import { recipients, type IssueEmail } from '@/lib/issueEmail'
import './email-issue.css'

function download({ csv, file }: IssueEmail) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/** Email someone a pre-written summary of an issue, with its time entries attached as a CSV. */
export function EmailIssue({ email }: { email: IssueEmail }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState(email.subject)
  const [body, setBody] = useState(email.body)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<string[]>([])

  function send() {
    const { list, error: why } = recipients(to)
    if (why) { setError(why); return }
    setSent(list)
    setOpen(false)
  }

  if (sent.length) return <p className="email-issue-sent" role="status"><Check size={14} aria-hidden />Sent to {sent.join(', ')} with {email.file}
    <button type="button" className="lnk" onClick={() => { setSent([]); setTo(''); setOpen(true) }}>Send to Someone Else</button></p>
  if (!open) return <Btn className="email-issue-open" onClick={() => setOpen(true)}><Mail aria-hidden />Email This Issue</Btn>

  return <form className="email-issue" aria-label="Email this issue" noValidate
    onSubmit={(event) => { event.preventDefault(); send() }}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false) } }}>
    <label className="email-issue-field">
      <span className="email-issue-lbl">To</span>
      <input className="q-input" type="email" multiple autoFocus value={to} placeholder="name@company.com"
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => { setTo(event.target.value); setError('') }} />
    </label>
    {error && <span className="email-issue-error" id={`${id}-error`} role="alert">{error}</span>}
    <label className="email-issue-field">
      <span className="email-issue-lbl">Subject</span>
      <input className="q-input" value={subject} onChange={(event) => setSubject(event.target.value)} />
    </label>
    <label className="email-issue-field email-issue-body">
      <span className="email-issue-lbl">Message</span>
      <textarea className="q-input" rows={11} value={body} onChange={(event) => setBody(event.target.value)} />
    </label>
    <div className="email-issue-attachment">
      <FileSpreadsheet size={16} aria-hidden />
      <span className="email-issue-file"><b>{email.file}</b><span>{email.rows.toLocaleString()} {email.rows === 1 ? 'row' : 'rows'}</span></span>
      <button type="button" className="lnk" onClick={() => download(email)}>Download</button>
    </div>
    <div className="email-issue-actions">
      <Btn type="submit" className="primary">Send</Btn>
      <Btn onClick={() => setOpen(false)}>Cancel</Btn>
    </div>
  </form>
}
