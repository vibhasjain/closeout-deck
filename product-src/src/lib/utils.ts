import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export { ordinal } from './cycles'

// Short connectors stay lowercase in button and tag labels unless they open or close the label.
const SMALL = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'as', 'per', 'via'])
/** Title Case for button and tag labels: "Send to account manager" → "Send to Account Manager". Only raises first letters, so ADP, OT, what's stay intact. */
export function titleCase(text: string) {
  const words = text.split(' ')
  return words.map((word, i) => i > 0 && i < words.length - 1 && SMALL.has(word.toLowerCase()) ? word
    : word.replace(/(^|[-(/])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase())).join(' ')
}
