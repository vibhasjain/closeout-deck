import { RULES } from '@/bench/engine.js'
import { kindLabel } from '@/lib/desk'
import { titleCase } from '@/lib/utils'
import type { Instinct, MemoryKind } from '@/lib/memory'

export const memoryKinds: { kind: MemoryKind; label: string }[] = [
  { kind: 'context', label: 'Context' },
  { kind: 'autonomy', label: 'Autonomy' },
  { kind: 'style', label: 'Style' },
]

export const memorySources: Record<Instinct['source'], string> = {
  site: 'Site', call: 'Call', chat: 'Chat', decisions: 'Decisions', send: 'Payroll', user: 'You',
}

const ruleLabels = new Map(RULES.map(rule => [rule.id, titleCase(kindLabel(rule.id))]))
const ruleIds = new RegExp(`\\b(${RULES.map(rule => rule.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g')

export const memoryRuleLabel = (ruleId: string) => ruleLabels.get(ruleId) ?? null

/** Decision memory currently carries engine ids in its text; keep those out of the UI and new rules. */
export const memoryText = (text: string) => text.replace(ruleIds, id => ruleLabels.get(id)!)

export function memoryDate(at: string) {
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function learnedAgo(at: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(at).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
