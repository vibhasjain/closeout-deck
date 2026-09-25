import { Globe, Mail, Plug, Sheet } from 'lucide-react'
import type { Connection } from '@/lib/onboarding'

export type Method = NonNullable<Connection['method']>

export const METHODS: { id: Method; label: string; hint: string; Icon: typeof Globe }[] = [
  { id: 'browser', label: 'Browser', hint: 'Simulate a system connection', Icon: Globe },
  { id: 'api', label: 'API', hint: 'Simulate a read-only API connection', Icon: Plug },
  { id: 'email', label: 'Forwarding inbox', hint: 'Simulate forwarded time exports', Icon: Mail },
  { id: 'sheet', label: 'Shared sheet', hint: 'Simulate a shared time-entry sheet', Icon: Sheet },
]
