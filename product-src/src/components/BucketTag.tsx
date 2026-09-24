import type { CSSProperties } from 'react'
import { bucketHue, kindLabel } from '@/lib/desk'

/** The rule's bucket, in that bucket's colour. The only classification a rule carries. */
export function BucketTag({ ruleId }: { ruleId: string }) {
  return <span className="bucket-tag" style={{ '--hue': bucketHue(ruleId) } as CSSProperties}>{kindLabel(ruleId)}</span>
}
