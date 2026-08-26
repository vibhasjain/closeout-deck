import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import logo from "@/assets/logo-small.svg"

const navigation = [
  ["The three jobs", "#jobs"],
  ["Rules", "#rules"],
  ["Who it's for", "#who"],
  ["Thesis", "#thesis"],
] as const

export function SiteHeader() {
  return (
    <header className="sticky top-0 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <a
          href="#top"
          className="flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <img src={logo} alt="" className="size-7" />
          <span className="font-heading font-medium">HyperTrack</span>
          <Separator
            orientation="vertical"
            className="mx-1 hidden h-4 sm:block"
          />
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Payroll Ops
          </span>
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-5 md:flex">
          {navigation.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant="outline"
            className="hidden font-normal text-muted-foreground lg:inline-flex"
          >
            Internal · hypothesis v1
          </Badge>
          <Button asChild size="sm">
            <a href="#detective">See it catch one</a>
          </Button>
        </div>
      </div>
    </header>
  )
}
