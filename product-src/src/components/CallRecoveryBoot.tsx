import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { recoverVoiceCall } from '@/lib/voiceActions'

/** Mounted once after signed-in profile hydration; call start shares its recovery promise. */
export function CallRecoveryBoot() {
  const navigate = useNavigate(), [params] = useSearchParams()
  useEffect(() => { void recoverVoiceCall(navigate, params).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
