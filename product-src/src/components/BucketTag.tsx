import type { CSSProperties } from 'react'
import { bucketHue, kindLabel } from '@/lib/desk'
import { titleCase } from '@/lib/utils'

/** The rule's plain-language bucket. Color is never required to recognize it. */
export function BucketTag({ ruleId }: { ruleId: string }) {
  return <span className="bucket-tag" style={{ '--hue': bucketHue(ruleId) } as CSSProperties}>{titleCase(kindLabel(ruleId))}</span>
}
