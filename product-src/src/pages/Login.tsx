import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { authErrorMessage, handleGoogleSignIn, signIn } from '@/lib/auth'
import { Btn, Spinner } from '@/components/ui'

export function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    setError('')
    if (!email.trim() || !password.trim()) return setError('Email and password are required')
    setLoading(true)
    try {
      await signIn(email.trim().toLowerCase(), password.trim())
      navigate('/payroll')
    } catch (err) {
      setError(authErrorMessage(err))
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-start justify-center gap-7 px-4 py-12">
      <div className="brand"><Logo /></div>
      <div className="flex flex-col items-start gap-2">
        <h1 className="r-sent">Sign in to Closeout Copilot</h1>
        <p className="r-note max-w-[46ch]">Use your HyperTrack dashboard account</p>
      </div>
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
        <input className="q-input w-full" id="email" type="email" aria-label="Email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="q-input w-full" id="password" type="password" aria-label="Password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="r-note" role="alert">{error}</p>}
        <Btn type="submit" disabled={loading} className="primary" aria-label={loading ? 'Signing in' : undefined}>
          {loading ? <Spinner /> : 'Sign in'}
        </Btn>
        <Btn onClick={() => handleGoogleSignIn().catch((err) => setError(authErrorMessage(err)))}>
          Sign in with Google
        </Btn>
      </form>
      <p className="r-note">Same login as the dashboard. Nothing gets connected today.</p>
    </main>
  )
}
