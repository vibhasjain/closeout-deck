import type { NavigateFunction } from 'react-router-dom'
import { applyAction } from '@/components/chat/ChatPane'
import type { ChatUpdate } from '@/lib/chatActions'
import { keepProposal } from '@/lib/memory'
import { memoryText } from './memoryDisplay'

/** Keeping a suggestion records the decision first; adding a rule uses the existing action path. */
export async function makeSuggestedRule(ruleId: string, update: ChatUpdate, navigate: NavigateFunction, params: URLSearchParams) {
  const instinct = await keepProposal(ruleId)
  if (instinct.status !== 'active') throw new Error('You asked me to forget this')
  await applyAction({ type: 'add_rule', sentence: memoryText(instinct.text) }, update, navigate, params)
}
