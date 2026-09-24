import { useEffect, useState } from 'react'
import { currentUserEmail } from '@/lib/auth'

/** Who is signed in, for attributing what they write on a review. */
export function useCurrentEmail() {
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    currentUserEmail().then(setEmail)
  }, [])
  return email
}
