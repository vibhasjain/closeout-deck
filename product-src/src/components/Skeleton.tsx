import './skeleton.css'

type SkeletonVariant = 'card' | 'next-step' | 'kpis' | 'review' | 'rail' | 'conversation' | 'profile' | 'number' | 'action'

/** Decorative pieces share one ghost treatment; the containing region owns the announcement. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />
}

/** Shapes mirror their destination so the page keeps its rhythm while data arrives. */
export function SkeletonRegion({ variant = 'card', className = '', rows }: { variant?: SkeletonVariant; className?: string; rows?: number }) {
  const count = rows ?? (variant === 'review' ? 5 : variant === 'kpis' ? 5 : 3)
  return <div className={`skeleton-region skeleton-${variant} ${className}`} role="status" aria-busy="true" data-skeleton={variant}>
    <span className="sr-only skeleton-label">Loading</span>
    {variant === 'next-step' ? <><Skeleton className="skeleton-step-line" /><Skeleton className="skeleton-pill" /></>
      : variant === 'number' || variant === 'action' ? <Skeleton className={variant === 'action' ? 'skeleton-action-bar' : 'skeleton-number'} />
        : variant === 'kpis' ? Array.from({ length: count }, (_, index) => <div className="skeleton-kpi" key={index}><Skeleton className="skeleton-caption" /><Skeleton className="skeleton-number" /></div>)
          : variant === 'review' ? Array.from({ length: count }, (_, index) => <div className="skeleton-review-row" key={index}>
            <Skeleton className="skeleton-tag" /><div className="skeleton-copy"><Skeleton className="skeleton-line" /><Skeleton className="skeleton-line skeleton-line-short" /></div>
            <div className="skeleton-amounts"><Skeleton className="skeleton-amount" /><Skeleton className="skeleton-amount" /></div>
          </div>)
            : variant === 'rail' ? Array.from({ length: count }, (_, index) => <div className="skeleton-rail-row" key={index}><Skeleton className="skeleton-title" /><Skeleton className="skeleton-line" /><Skeleton className="skeleton-tag" /></div>)
              : variant === 'conversation' ? Array.from({ length: count }, (_, index) => <div className="skeleton-message" key={index}><Skeleton className="skeleton-caption" /><Skeleton className="skeleton-line" /><Skeleton className="skeleton-line skeleton-line-short" /></div>)
                : <><Skeleton className="skeleton-title" />{Array.from({ length: count }, (_, index) => <Skeleton key={index} className={`skeleton-line${index === count - 1 ? ' skeleton-line-short' : ''}`} />)}{variant === 'profile' && <div className="skeleton-profile-fields"><Skeleton className="skeleton-field" /><Skeleton className="skeleton-field" /><Skeleton className="skeleton-field" /><Skeleton className="skeleton-field" /></div>}</>}
  </div>
}
