import { Globe, Mail, Plug } from 'lucide-react'
import type { Connection } from '@/lib/onboarding'

export type Method = NonNullable<Connection['method']>

export const METHODS: { id: Method; label: string; hint: string; Icon: typeof Globe }[] = [
  { id: 'browser', label: 'Browser', hint: 'Sign in once. The agent reads it like you do.', Icon: Globe },
  { id: 'api', label: 'API', hint: 'Paste a read-only API key', Icon: Plug },
  { id: 'email', label: 'Email', hint: 'Forward the exports you already get', Icon: Mail },
]
