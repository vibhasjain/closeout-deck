import type { ReactNode, Ref } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function MockFrame({
  title,
  ariaLabel,
  children,
  live = false,
  meta,
  caption,
  className,
  contentClassName,
  frameRef,
}: {
  title: string
  ariaLabel: string
  children: ReactNode
  live?: boolean
  meta?: ReactNode
  caption?: ReactNode
  className?: string
  contentClassName?: string
  frameRef?: Ref<HTMLDivElement>
}) {
  return (
    <Card
      ref={frameRef}
      role="img"
      aria-label={ariaLabel}
      aria-live="off"
      className={cn("w-full bg-card ring-1 ring-border", className)}
    >
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b">
        <div className="flex min-w-0 items-center gap-2">
          {live ? (
            <span
              aria-hidden="true"
              className="animate-pulse-dot size-2 shrink-0 rounded-full bg-primary ring-1 ring-primary/30"
            />
          ) : null}
          <span className="truncate font-mono text-xs font-medium text-muted-foreground">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {meta}
          <Badge
            variant="outline"
            className="font-normal text-muted-foreground"
          >
            synthetic
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={cn("min-w-0", contentClassName)}>
        {children}
      </CardContent>
      {caption ? (
        <div className="border-t px-4 pt-3 text-xs text-muted-foreground">
          {caption}
        </div>
      ) : null}
    </Card>
  )
}
