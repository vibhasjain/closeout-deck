# /payroll — HyperTrack Payroll Ops landing page

Source for `closeoutcopilot.com/payroll`. Vite + React 19 + TypeScript + Tailwind v4 + shadcn (nova / radix).

- `npm run dev` — local dev at `http://localhost:5173/payroll/`
- `npm run build` — typechecks and writes the static site to `../payroll/` (committed; Netlify also rebuilds it via `netlify.toml`)
- `npm run typecheck` / `npm run lint`

Layout: `src/sections/*` are the page sections in order (see `src/App.tsx`); `src/mocks/*` are the autoplaying product mocks; `src/data/shifts.ts` is the single synthetic dataset every mock reads from; `src/lib/useSequence.ts` is the one animation hook (timer-driven phases, pauses offscreen, honours `prefers-reduced-motion`).

The full build brief (direction contract, tokens, copy, mock scripts) is `BRIEF.md`. Product truth lives in `PRODUCT.md`. All numbers on the page are synthetic.
