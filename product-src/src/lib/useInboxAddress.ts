import { useEffect, useState } from 'react'
import { currentUserEmail } from '@/lib/viewerSession'
import { inboxAddress } from '@/lib/onboarding'

export function useInboxAddress() {
  const [address, setAddress] = useState(inboxAddress(null))
  useEffect(() => {
    currentUserEmail().then((e) => setAddress(inboxAddress(e)))
  }, [])
  return address
}
