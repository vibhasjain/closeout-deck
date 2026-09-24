import { useEffect, useRef } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { RULES } from '@/bench/engine.js'
import { PROV } from '@/bench/prov'
import { BucketTag } from '@/components/BucketTag'
import { Tag } from '@/components/ui'
import { useOnboarding } from '@/lib/onboarding'
import { formatRuleSource, formatRuleText } from '@/lib/rules'

function SourceDocumentLink({ url, excerpt, label }: { url?: string; excerpt: string; label: string }) {
  const anchor = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (url || !anchor.current) return
    const localUrl = URL.createObjectURL(new Blob([excerpt], { type: 'text/plain;charset=utf-8' }))
    anchor.current.href = localUrl
    return () => URL.revokeObjectURL(localUrl)
  }, [url, excerpt])

  return <a ref={anchor} className="btn rule-applied-source" href={url} target="_blank" rel="noopener noreferrer" title={label}>
    <span className="btn-label">{label}</span><ArrowUpRight size={12} aria-hidden="true" className="btn-arrow" />
  </a>
}

/** The rule in plain words and where it comes from. Nothing else: the bucket tag is its only classification. */
export function RuleDetail({ ruleId }: { ruleId: string }) {
  const [state] = useOnboarding()
  const rule = RULES.find((item) => item.id === ruleId)
  const custom = state.customRules.find((item) => item.id === ruleId)
  const proposal = state.proposals.find((item) => item.id === ruleId)
  const metadata = state.rules.find((item) => item.id === ruleId) ?? proposal

  if (!rule && !custom && !proposal) return null

  const source = PROV[ruleId]
  const sentence = rule?.sentence ?? custom?.sentence ?? proposal?.text
  const sourceDoc = source?.doc ?? rule?.source.doc ?? metadata?.source
  const doc = sourceDoc ? formatRuleSource(sourceDoc) : undefined
  const excerpt = [doc, source?.dates ?? metadata?.effective, source?.verbatim?.replace(/<[^>]+>/g, '') ?? sentence, rule?.source.cite ?? metadata?.cite].filter(Boolean).join('\n\n')

  return <div className="rule-detail">
    <BucketTag ruleId={ruleId} />
    <div className="rule-applied">
      <p className="rule-applied-text">{formatRuleText(sentence ?? '')}</p>
      {rule && doc ? <SourceDocumentLink url={source?.url} excerpt={excerpt} label={doc} /> : <Tag className="rule-applied-source">Custom</Tag>}
    </div>
  </div>
}
