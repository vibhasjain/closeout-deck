import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Btn } from '@/components/ui'

/** Read-only account inbox with a copy button. */
export function InboxAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setFailed(false)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2400)
    } catch {
      setFailed(true)
    }
  }
  return (
    <div className="inbox-address">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="mono select-all">{address}</span>
        <Btn onClick={() => void copy()} aria-live="polite">
          <span className="morph" aria-hidden="true"><Copy data-off={copied ? '' : undefined} /><Check data-off={copied ? undefined : ''} /></span>
          {copied ? 'Copied' : 'Copy'}
        </Btn>
      </div>
      {failed && <p className="r-note" role="status">Select the address and copy it from your browser</p>}
    </div>
  )
}
