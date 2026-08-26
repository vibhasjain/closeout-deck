import logo from "@/assets/logo-small.svg"

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <div className="flex items-center gap-2 text-foreground">
          <img src={logo} alt="" className="size-6" />
          <span className="font-heading font-medium">HyperTrack</span>
        </div>
        <p>Synthetic demo data · Hypothesis · August 2026</p>
        <a
          href="https://closeoutcopilot.com"
          className="rounded-sm underline decoration-border underline-offset-4 transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          closeoutcopilot.com
        </a>
      </div>
    </footer>
  )
}
