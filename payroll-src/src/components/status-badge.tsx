import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type Status =
  | "processing"
  | "flagged"
  | "awaiting"
  | "held"
  | "resolved"
  | "paid"
  | "corrected"
  | "refused"
  | "escalated"

const statusClasses: Record<Status, string> = {
  processing: "bg-info/10 text-info-foreground",
  flagged: "bg-warning/10 text-warning-foreground",
  awaiting: "bg-warning/10 text-warning-foreground",
  held: "bg-warning/10 text-warning-foreground",
  resolved: "bg-success/10 text-success-foreground",
  paid: "bg-success/10 text-success-foreground",
  corrected: "bg-success/10 text-success-foreground",
  refused: "bg-destructive/10 text-destructive-foreground",
  escalated: "bg-destructive/10 text-destructive-foreground",
}

const statusLabels: Record<Status, string> = {
  processing: "Processing",
  flagged: "Flagged",
  awaiting: "Awaiting manager",
  held: "Held",
  resolved: "Resolved",
  paid: "Paid",
  corrected: "Corrected",
  refused: "Refused",
  escalated: "Escalated",
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: Status
  label?: string
  className?: string
}) {
  return (
    <Badge
      className={cn("border-transparent", statusClasses[status], className)}
    >
      {label ?? statusLabels[status]}
    </Badge>
  )
}
