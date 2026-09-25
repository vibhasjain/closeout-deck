import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Btn, Spinner } from '@/components/ui'
import { API_BASE } from '@/lib/api'
import { recentCycles } from '@/lib/cycles'
import { intakeHref } from '@/lib/intake'
import { getOnboarding } from '@/lib/onboarding'
import { authHeaders } from '@/lib/onboardingFlow'
import { signOut } from '@/lib/viewerSession'
import './first-closeout-choice.css'

export function FirstCloseoutChoice({ choice }: { choice: { yours: string; sample: string } }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sample, setSample] = useState(false)
  async function loadSample() {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${API_BASE}/data/sample`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: '{}' })
      if (response.status === 401) signOut()
      if (!response.ok && response.status !== 404 && response.status !== 501) throw new Error('I couldn’t load the sample. Try again.')
      setSample(true)
      navigate('/payroll')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'I couldn’t load the sample. Try again.') }
    finally { setBusy(false) }
  }
  return <div className="first-closeout-choice">
    <div className="first-closeout-options">
      <Btn disabled={busy} onClick={() => navigate(intakeHref(recentCycles(getOnboarding(), 2)[1].id))}>{choice.yours}</Btn>
      <Btn disabled={busy} onClick={() => void loadSample()}>{busy && <Spinner />}{choice.sample}</Btn>
    </div>
    {sample && <span className="tag">Sample</span>}
    {error && <div role="alert"><p>{error}</p><Btn onClick={() => void loadSample()}>Retry</Btn></div>}
  </div>
}
