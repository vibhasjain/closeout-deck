// Source: https://www.beautifului.dev/r/shimmer.json — Shimmer, adapted to monochrome and reduced motion.
import type { ReactNode } from 'react'
import './shimmer.css'

/** The registry's moving background-clipped label signals real work in progress. */
export function Shimmer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`beautiful-shimmer ${className}`}>{children}</span>
}
