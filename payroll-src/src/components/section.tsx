import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function Section({
  id,
  title,
  lede,
  tone = "white",
  children,
  className,
  headerClassName,
}: {
  id: string
  title: string
  lede?: ReactNode
  tone?: "white" | "muted"
  children?: ReactNode
  className?: string
  headerClassName?: string
}) {
  const headingId = `${id}-heading`

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        tone === "muted" ? "bg-muted/55" : "bg-background",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-5 py-20 sm:px-8 md:py-28 lg:px-10">
        <header
          className={cn("flex max-w-[75ch] flex-col gap-5", headerClassName)}
        >
          <h2
            id={headingId}
            className="font-heading text-3xl leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-4xl lg:text-5xl"
          >
            {title}
          </h2>
          {lede ? (
            <div className="max-w-[72ch] text-base leading-7 text-muted-foreground sm:text-lg">
              {lede}
            </div>
          ) : null}
        </header>
        {children}
      </div>
    </section>
  )
}
