import wordmark from '@/assets/hypertrack-logo.svg'
import mark from '@/assets/hypertrack-sm.svg'
import { cn } from '@/lib/utils'

export function Logo({ variant = 'wordmark', className }: { variant?: 'wordmark' | 'mark'; className?: string }) {
  const src = variant === 'mark' ? mark : wordmark
  return <img src={src} alt="HyperTrack" className={cn('w-auto', variant === 'mark' ? 'h-6' : 'h-7', className)} />
}
