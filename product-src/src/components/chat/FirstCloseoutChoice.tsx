import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Btn, Spinner } from '@/components/ui'
import { seedSample } from '@/lib/data'
import { recentCycles } from '@/lib/cycles'
import { intakeHref } from '@/lib/intake'
import { getOnboarding } from '@/lib/onboarding'
import './first-closeout-choice.css'

export function FirstCloseoutChoice({ choice }: { choice: { yours: string; sample: string } }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sample, setSample] = useState(false)
  async function loadSample() {
    setBusy(true); setError('')
    try {
      const result = await seedSample()
      setSample(true)
      navigate(`/payroll?${new URLSearchParams({ cycle: result.cycleId, step: 'review' })}`)
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
