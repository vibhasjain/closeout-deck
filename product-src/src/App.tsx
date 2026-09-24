import { useLayoutEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom'
import { OnboardingLayout } from '@/components/OnboardingLayout'
import { RailLayout } from '@/components/shell/RailLayout'
import { Agent } from '@/pages/setup/Agent'
import { Payroll } from '@/pages/Payroll'
import { ShiftPage } from '@/pages/ShiftPage'
import { Rules } from '@/pages/Rules'
import { Settings } from '@/pages/Settings'
import { canonicalHref } from '@/lib/navigation'

// Route changes keep the open agent in the address. Browser history remains an
// exact restoration, including entries where the agent was explicitly closed.
function AgentRoutePersistence() {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const previous = useRef(location)
  useLayoutEffect(() => {
    const from = previous.current
    previous.current = location
    const params = new URLSearchParams(location.search)
    if (navigationType !== 'POP' && from.pathname !== location.pathname
      && new URLSearchParams(from.search).get('agent') === '1' && !params.has('agent')) {
      params.set('agent', '1')
      navigate({ pathname: location.pathname, search: `?${params}`, hash: location.hash }, { replace: true, state: location.state })
    }
  }, [location, navigate, navigationType])
  return null
}

function LegacyCycle() {
  const { id } = useParams()
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  if (id) params.set('cycle', id)
  return <Navigate to={`/payroll?${params}`} replace />
}

function LegacyNavigation() {
  const { pathname, search, hash } = useLocation()
  return <Navigate to={canonicalHref(`${pathname}${search}${hash}`)} replace />
}

export function AppRoutes() {
  return (
    <Routes>
      {['/onboarding/*', '/setup', '/setup/calendar', '/setup/check', '/setup/forward'].map((path) =>
        <Route key={path} path={path} element={<Navigate to="/setup/agent" replace />} />)}
      <Route path="/home" element={<Navigate to="/payroll" replace />} />
      <Route path="/setup/done" element={<Navigate to="/payroll" replace />} />
      <Route path="/cycles/:id" element={<LegacyCycle />} />
      <Route element={<OnboardingLayout />}>
        <Route path="/setup/agent" element={<Agent />} />
        <Route path="/connect" element={<LegacyNavigation />} />
        <Route path="/reconcile" element={<LegacyNavigation />} />
        <Route path="/reconcile/:shiftId" element={<LegacyNavigation />} />
        <Route path="/timesheets" element={<LegacyNavigation />} />
        <Route path="/timesheets/:shiftId" element={<LegacyNavigation />} />
        <Route path="/payroll" element={<Payroll />}>
          <Route path=":shiftId" element={<ShiftPage />} />
        </Route>
        <Route path="/rules" element={<RailLayout><Rules /></RailLayout>} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/payroll" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AgentRoutePersistence />
      <AppRoutes />
    </BrowserRouter>
  )
}
