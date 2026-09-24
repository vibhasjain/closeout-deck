import { CATALOG } from '@/bench/catalog.js'
import { RULES } from '@/bench/engine.js'
import type { Onboarding } from '@/lib/onboarding'
import type { Finding } from '@/lib/sample'

// Option lists from the Discovery Intake sheet's dropdowns.
export const PAY_PERIODS = ['Daily', 'Weekly', 'Bi-weekly (every 2 weeks)', 'Semi-monthly (twice a month)', 'Monthly', 'Varies by client', 'Other']
export const PAYROLL = ['ADP Workforce Now', 'ADP Vantage HCM / Enterprise', 'ADP Streamline / Celergo', 'Paychex Flex', 'Paylocity', 'Paycom', 'Paycor',
  'UKG Pro (UltiPro)', 'UKG Ready', 'Workday Payroll', 'PrismHR', 'isolved']
export const BILLING = ['Avionte BOLD', 'TempWorks (Beyond / Enterprise)', 'Bullhorn Back Office', 'Bullhorn One', 'COATS Staffing Software', 'Zenople',
  'Erecruit / Bullhorn Enterprise', 'Sage Intacct', 'Sage 100 / Sage 300', 'NetSuite', 'Microsoft Dynamics 365 Business Central', 'QuickBooks (Online or Desktop)']
export const VMS = ['SAP Fieldglass', 'Beeline', 'Workday VNDLY', 'Coupa Contingent Workforce', 'Magnit (PRO Unlimited)', 'Simplify VMS', 'Conexis VMS', 'Prosperix',
  'Stafferlink', 'Pixid VMS', 'AgileOne Acceleration', 'Utmost']
export const WORKER_CHANNELS = ['Our own mobile app', 'Third-party mobile app', 'Web form / worker portal', 'Text / SMS', 'WhatsApp or other messaging',
  'Email (photo or PDF of timesheet)', 'Phone call / IVR', 'Paper timesheet handed in at the office', "They don't - we take time from the client's system", 'Varies by client', 'Other']
export const CLIENT_TIME = ['UKG Pro Workforce Management (Kronos Dimensions)', 'UKG Ready (Workforce Ready)', 'UKG Workforce Central (legacy Kronos)', 'Workday Time Tracking',
  'ADP Time & Attendance / eTime', 'Paycom Time & Labor', 'Paylocity Time & Labor', 'Ceridian Dayforce', 'Oracle HCM Time & Labor', 'SAP SuccessFactors Time Tracking',
  'Infor Workforce Management', 'Blue Yonder (JDA) Workforce']
export const APPROVED = ['VMS export or VMS approval feed', "We have login access to the client's timekeeping system and pull it", 'Direct system integration / API feed',
  'CSV or Excel file emailed by the client', 'PDF timesheet emailed by the client', 'Signed paper timesheet the worker brings back', 'Photo of a signed timesheet by text / messaging',
  'SFTP or shared drive drop', 'Client enters approved time into our portal', 'Verbal or phone confirmation', 'Not applicable', 'Other']
export const PAYOUTS = ['<250', '250–1,000', '1,000–5,000', '5,000+']

/**
 * What the agent fixed on its own under the account's authority, and what it stopped for, with why.
 * The limit is per time entry (the largest single correction); the weekly cap admits the smallest findings first.
 */
export function split(found: Finding[], { autoFix, limit, weeklyCap }: Onboarding['authority']) {
  const why = new Map(found.map((finding) => {
    const largest = Math.max(0, ...finding.cases.map((c) => Math.abs(c.delta)))
    return [finding, finding.dispute === 'Client dispute' ? 'Touches a client invoice' : finding.dispute === 'Margin' ? 'Changes a client bill rate'
      : !autoFix ? 'You asked me to check first' : largest > limit ? `Over $${limit}` : '']
  }))
  let total = 0
  for (const finding of found.filter((f) => !why.get(f)).sort((a, b) => a.amount - b.amount)) {
    if (total + finding.amount > weeklyCap) why.set(finding, `Over the $${weeklyCap.toLocaleString()} weekly cap`)
    else total += finding.amount
  }
  return { fixed: found.filter((f) => !why.get(f)), stopped: found.filter((f) => why.get(f)).map((finding) => ({ finding, why: why.get(finding)! })) }
}

/** Agent setup's turns by stage, one question each; `?step=` holds the current one. Time sources come first so the demo can name them. */
export const STAGES = ['Welcome', 'Pay cycle', 'Pay cycle', 'Pay cycle', 'Pay cycle', 'How time gets reported', 'How time gets reported', 'How time gets reported',
  'See it work', 'See it work', 'Systems of record', 'Systems of record', 'Systems of record', 'Your rules', 'Access']
export const TURNS = STAGES.length
export const turnOf = (value: string | null) => Math.min(Math.max(Math.trunc(Number(value)) || 1, 1), TURNS)
const words = (text: string) => text.toLowerCase().replace(/[-'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const YES = /^(yes|yep|yeah|yup|correct|right|sure|ok|okay|looks good|sounds good)\b/, NO = /^(no|nope|nah|none|not really)\b/
const AGREE = ["That's right", 'Makes sense', 'Add another', "Let's start", 'Show me the magic'], DECLINE = ['Change', 'No, just this one', "That's all", 'Not applicable']
/** The answer a typed reply names: a label, a label it starts or is started by, or a plain yes or no. -1 when none or several do. */
export function typedPick(text: string, labels: string[]) {
  const said = words(text)
  if (!said) return -1
  const exact = labels.findIndex((label) => words(label) === said)
  if (exact >= 0) return exact
  const yesNo = YES.test(said) ? AGREE : NO.test(said) ? DECLINE : null
  if (yesNo) return labels.findIndex((label) => yesNo.includes(label))
  const near = labels.flatMap((label, i) => `${words(label)} `.startsWith(`${said} `) || said.startsWith(`${words(label)} `) ? [i] : [])
  return near.length === 1 ? near[0] : -1
}
/** Each answer in a typed list ("text and email, Bullhorn T&A"): the option it names, or the words as typed. */
export const typedPicks = (text: string, labels: string[]) => [...new Set(text.split(/\s*(?:[,;]|\band\b|\bplus\b)\s*/i)
  .map((part) => part.trim()).filter(Boolean).map((part) => labels[typedPick(part, labels)] ?? part))]
/** How the demo intro names a time source; picks that aren't a source (Other, Not sure, Varies by client) have no entry. */
export const SOURCE_PHRASES: Record<string, string> = { 'Our own mobile app': 'your own app', 'Third-party mobile app': 'a third-party app',
  'Web form / worker portal': 'a worker portal', 'Text / SMS': 'texts', 'WhatsApp or other messaging': 'WhatsApp', 'Email (photo or PDF of timesheet)': 'emailed timesheets',
  'Phone call / IVR': 'phone calls', 'Paper timesheet handed in at the office': 'paper timesheets', 'VMS export or VMS approval feed': 'the VMS',
  "We have login access to the client's timekeeping system and pull it": "the client's timekeeping system", 'Direct system integration / API feed': 'a direct feed',
  'CSV or Excel file emailed by the client': 'emailed spreadsheets', 'PDF timesheet emailed by the client': 'emailed PDFs',
  'Signed paper timesheet the worker brings back': 'signed paper timesheets', 'Photo of a signed timesheet by text / messaging': 'photos of signed timesheets',
  'SFTP or shared drive drop': 'a file drop', 'Client enters approved time into our portal': 'your portal', 'Verbal or phone confirmation': 'phone confirmations' }
const NOT_A_SOURCE = ['Other', 'Not sure', 'Not applicable']
/** The demo's opening line from the user's first real time sources, or '' when they gave none. A source they typed is named as typed. */
export function sourcesLine({ workerChannels, approved }: Pick<Onboarding['discovery'], 'workerChannels' | 'approved'>) {
  const [worker, client] = [[workerChannels, WORKER_CHANNELS], [approved, APPROVED]].map(([values, listed]) =>
    values.map((value) => SOURCE_PHRASES[value] ?? (listed.includes(value) || NOT_A_SOURCE.includes(value) ? '' : value)).find(Boolean))
  return worker && client ? `You get time from ${worker} and approved time from ${client}.`
    : worker ? `You get time from ${worker}.` : client ? `You get approved time from ${client}.` : ''
}
export const list = (items: string[]) => items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] ?? ''

/** The rulebook the demo ran on, grouped the way a payroll lead reads it. */
export const RULEBOOK = ['Federal', 'California', 'Other states and cities', 'Timekeeping', 'Contracts and sites'].map((title) => ({
  title,
  rules: RULES.filter((rule) => (/^(FED|TB)-|^SRC-WEEK/.test(rule.id) ? 'Federal' : rule.id.startsWith('CA-') ? 'California'
    : rule.bucket === 'State' || rule.bucket === 'Local' ? 'Other states and cities' : rule.bucket === 'Common sense' ? 'Timekeeping'
      : rule.bucket === 'Contract' || rule.bucket === 'Facility' ? 'Contracts and sites' : null) === title)
    .map((rule) => ({ id: rule.id, sentence: rule.sentence, cite: rule.source.doc })),
}))
/** States named in the catalog's rule packs, beyond what the rulebook runs today. */
export const CATALOG_STATES = ['California', 'New York', 'Colorado', 'New Jersey', 'Illinois', 'Oregon', 'Texas'].filter((name) => CATALOG.some((pack) => pack.juris.includes(name)))

/** A client addendum to try the rules flow with, read by the same clause extractor as a dropped text file. */
export const SAMPLE_CONTRACT = { name: 'lonestar_addendum.pdf', text: `LONESTAR PACKAGING · CLIENT ADDENDUM
Client: Lonestar Packaging
Effective: 2026-10-05
2.1 Hours worked from 10:00 PM to 6:00 AM carry a $1.50/hr night differential.
2.2 Workers called in are paid and billed a minimum of 4 hours.
2.3 Hours over 10 in a workday are paid and billed at 1.5x.
2.4 Any adjustment over $250 needs Lonestar Packaging's written approval before invoicing.` }
