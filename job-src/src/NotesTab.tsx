import { useState, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { ClaudeCrab } from '@/components/ClaudeCrab'
import { FadeText } from '@/components/FadeText'
import { ListToolbar } from '@/components/ListToolbar'
import { cn } from '@/lib/utils'

// ponytail: notes are hand-written by us, not feed data — a static list here.
// Move them into feed.json if the worker ever needs to author one.
interface Note {
  id: string
  title: string
  meta: string
  render: () => ReactNode
}

const NO_FILTERS: readonly string[] = []
const PAYROLL_URL = 'https://closeoutcopilot.com/payroll'

// -- Note 1: Timekeeping → payroll flow (Aashish, synthesis of 7 interviews) --

function Owner({ kind }: { kind: 'client' | 'agency' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide',
        kind === 'client' ? 'text-client' : 'text-agency',
      )}
    >
      <span className={cn('size-1.5 rounded-full', kind === 'client' ? 'bg-client' : 'bg-agency')} />
      {kind === 'client' ? 'Client-owned' : 'Staffing-owned'}
    </span>
  )
}

function Card({
  title,
  owner,
  systems,
  children,
  className,
}: {
  title: string
  owner?: 'client' | 'agency'
  systems?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border bg-background px-3.5 py-3', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-semibold">{title}</p>
        {owner && <Owner kind={owner} />}
      </div>
      {systems && <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{systems}</p>}
      {children && <div className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{children}</div>}
    </div>
  )
}

function Step({
  n,
  flow,
  title,
  last,
  children,
}: {
  n: number
  flow?: string
  title: string
  last?: boolean
  children: ReactNode
}) {
  return (
    <li className={cn('relative pl-7', !last && 'pb-6')}>
      <span className="absolute left-0 top-0 flex size-5 items-center justify-center rounded-full border bg-background font-mono text-[10px] text-muted-foreground">
        {n}
      </span>
      {flow && (
        <p className="mb-1 font-mono text-[10.5px] text-muted-foreground/70">
          <span aria-hidden="true">↓</span> {flow}
        </p>
      )}
      <p className="text-[13px] font-semibold">{title}</p>
      <div className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{children}</div>
    </li>
  )
}

function Quote({ children, by }: { children: ReactNode; by?: string }) {
  return (
    <p className="mt-2 border-l-2 border-border pl-3 text-[12.5px] italic text-foreground/80">
      “{children}”{by && <span className="not-italic text-muted-foreground"> — {by}</span>}
    </p>
  )
}

function MoneyNode({ label, owner }: { label: string; owner?: 'client' | 'agency' }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 rounded-lg border bg-background px-3 py-2 text-center">
      <span className="text-[12.5px] font-semibold">{label}</span>
      {owner && <Owner kind={owner} />}
    </div>
  )
}

function MoneyArrow({ label }: { label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
      <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      <span className="w-full border-t border-dashed border-muted-foreground/50" aria-hidden="true" />
    </div>
  )
}

const VARIANTS = [
  {
    who: 'Iron Built · construction',
    systems: 'ExakTime',
    text: "Host client pays lent-out workers and bills the staffing company, which takes 50% of every hour. Her crew still clocks on ExakTime, purely to audit the host's paper billing.",
  },
  {
    who: 'Whirlpool & Adecco · manufacturing',
    systems: 'Kronos/UKG Pro, Bullhorn',
    text: "Agency workers badge in on the client's own clock. The agency invoices at a markup through Bullhorn; she reconciles it against her hours report every cycle.",
  },
  {
    who: 'Skilled nursing home · agency CNAs',
    systems: 'Union contract',
    text: 'Weekly close, midweek confirmation deadline with each agency. One consolidated check per agency — never paid to workers directly. Late fixes trigger a union penalty.',
  },
  {
    who: 'Selfhelp · home health aides',
    systems: 'UKG Ready → UKG Pro',
    text: 'Weekly home-care payroll arrives as a spreadsheet plus paper timesheets — no clock at all. Retro fixes happen by hand outside the system.',
  },
  {
    who: 'Multi-plant manufacturing',
    systems: 'Oracle OTL, Timesheet Plus, ADP',
    text: 'Five plants, five clock systems. Each is converted to Excel and run through a self-built AI precheck, encoding what a normal shift looks like.',
  },
  {
    who: 'Home care, direct-hire only',
    systems: 'Access Care → Paylocity',
    text: "No agencies, no second record, almost no hours disputes. The failure mode isn't the clock — it's new hires forgotten on the payroll run.",
  },
]

function FlowNote() {
  return (
    <article className="mx-auto max-w-[52rem]">
      <p className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
        Pay-ops synthesis · 7 candidate interviews
      </p>
      <h1 className="mt-1 text-[20px] font-semibold tracking-tight">How a punch becomes a paycheck</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        The general shape of the flow across manufacturing, home care, nursing homes and construction:
        two competing time records, a reconciliation step, and a staffing company sitting between
        client and worker.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-muted-foreground" aria-hidden="true" />time / data flow</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-muted-foreground" aria-hidden="true" />money flow</span>
        <Owner kind="client" />
        <Owner kind="agency" />
      </div>

      <ol className="relative mt-6 before:absolute before:bottom-6 before:left-[9px] before:top-5 before:w-px before:bg-border">
        <Step n={1} title="Worker">
          Clocks in, clocks out — badge, app, or paper.
        </Step>

        <Step n={2} flow="raw punches" title="Timekeeping system">
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <Card title="Client's system" owner="client" systems="Badge clock (Kronos → UKG Pro), Oracle OTL, Timesheet Plus" />
            <Card title="Staffing co.'s system" owner="agency" systems="ExakTime, Access Care app, paper timesheets" />
          </div>
          <p className="mt-2">Run side by side — neither side trusts the other alone.</p>
          <Card title="Second record" systems="Foreman's daily log, camera footage, mailed timesheets" className="mt-2" />
        </Step>

        <Step n={3} flow="two numbers" title="Reconciliation">
          Rules flag what breaks a pattern: zero hours on an active day, 30+ hours of OT, a missed punch.
          <Quote by="Linley Walter">AI will work as long as I am asking the correct way.</Quote>
        </Step>

        <Step n={4} title="Escalation ladder">
          Manager confirms → client HR signs off → settled number.
        </Step>

        <Step n={5} flow="confirmed hours" title="Confirmed hours go two ways" last>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <Card title="Payroll system → net pay" systems="ADP, UKG, Paylocity, Dayforce">
              Direct-hire: client pays worker directly. Agency: staffing co. is paid, then pays the worker.
              <Quote>The arithmetic is trivial, the data is not.</Quote>
            </Card>
            <Card title="ATS / VMS layer → invoice" owner="agency">
              Confirmed hours become the agency's invoice line — e.g. Adecco → Bullhorn, 33.5% markup over
              the client's own clock data.
              <p className="mt-1.5 text-foreground/80">
                Contract terms bite here: client often pays the wrong invoice first, claws back the fix next cycle.
              </p>
            </Card>
          </div>
        </Step>
      </ol>

      <div className="mt-6 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-3">
        <MoneyNode label="Client" owner="client" />
        <MoneyArrow label="invoice, at markup" />
        <MoneyNode label="Staffing company" owner="agency" />
        <MoneyArrow label="wages" />
        <MoneyNode label="Worker" />
      </div>

      <h2 className="mt-8 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
        Six variants of the same loop
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {VARIANTS.map((variant) => (
          <Card key={variant.who} title={variant.who} systems={variant.systems}>
            {variant.text}
          </Card>
        ))}
      </div>
    </article>
  )
}

// -- Note 2: the payroll landing page ----------------------------------------

function PayrollNote() {
  return (
    <iframe
      src={`${PAYROLL_URL}/`}
      title="HyperTrack Payroll Ops landing page"
      className="h-full w-full flex-1 border-0"
    />
  )
}

const NOTES: readonly Note[] = [
  {
    id: 'n-timekeeping-to-payroll',
    title: 'Timekeeping to payroll flow',
    meta: 'Aashish · Aug 27 · 7 interviews',
    render: () => (
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
        <FlowNote />
      </div>
    ),
  },
  {
    id: 'n-payroll-landing',
    title: 'Payroll Ops landing page',
    meta: 'closeoutcopilot.com/payroll',
    render: () => <PayrollNote />,
  },
]

export function NotesTab({
  mobileDetail,
  onMobileDetail,
}: {
  mobileDetail: boolean
  onMobileDetail: (open: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>(NOTES[0].id)
  const q = query.trim().toLowerCase()
  const filtered = q ? NOTES.filter((note) => note.title.toLowerCase().includes(q)) : NOTES
  const selected = NOTES.find((note) => note.id === selectedId) ?? NOTES[0]

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className={cn('w-full shrink-0 flex-col border-r md:flex md:w-[320px]', mobileDetail ? 'hidden md:flex' : 'flex')}>
        <ListToolbar
          searchPlaceholder="Search notes"
          q={query}
          onQ={setQuery}
          options={NO_FILTERS}
          filter="notes"
          onFilter={() => {}}
        />
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <ClaudeCrab className="size-7 text-muted-foreground/40" />
              <p className="text-[12px] text-muted-foreground">No notes match</p>
            </div>
          )}
          {filtered.map((note) => (
            <button
              key={note.id}
              onClick={() => {
                setSelectedId(note.id)
                onMobileDetail(true)
              }}
              className={cn(
                'block w-full border-l-2 px-3 py-2.5 text-left transition-colors',
                note.id === selected.id ? 'border-foreground bg-muted/70' : 'border-transparent hover:bg-muted/40',
              )}
            >
              <FadeText text={note.title} className="text-[12.5px] font-semibold" />
              <p className="mt-1 font-mono text-[10.5px] text-muted-foreground/70">{note.meta}</p>
            </button>
          ))}
        </div>
      </div>

      <div className={cn('min-w-0 flex-1 flex-col md:flex', mobileDetail ? 'flex' : 'hidden')}>
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold leading-snug">
              <FadeText text={selected.title} />
            </h2>
            <p className="font-mono text-[11px] text-muted-foreground">{selected.meta}</p>
          </div>
          {selected.id === 'n-payroll-landing' && (
            <a
              href={PAYROLL_URL}
              target="_blank"
              rel="noopener"
              className="ml-3 flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
            >
              Open
              <ExternalLink className="size-2.5" aria-hidden="true" />
            </a>
          )}
        </header>
        {selected.render()}
      </div>
    </div>
  )
}
