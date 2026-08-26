import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Chaser } from "@/sections/Chaser"
import { Close } from "@/sections/Close"
import { Detective } from "@/sections/Detective"
import { Hero } from "@/sections/Hero"
import { NeverLeaves } from "@/sections/NeverLeaves"
import { Processor } from "@/sections/Processor"
import { Stakes } from "@/sections/Stakes"
import { Thesis } from "@/sections/Thesis"
import { ThreeJobs } from "@/sections/ThreeJobs"
import { Today } from "@/sections/Today"
import { WhoWhyNow } from "@/sections/WhoWhyNow"

export function App() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Today />
        <ThreeJobs />
        <Detective />
        <Chaser />
        <Processor />
        <NeverLeaves />
        <Stakes />
        <WhoWhyNow />
        <Thesis />
        <Close />
      </main>
      <SiteFooter />
    </>
  )
}

export default App
