import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

import { AppShell, DataErrorScreen, DataLoadingScreen } from './app/AppShell'
import { CheckingScreen, SetupScreen, UnlockScreen } from './app/AuthScreens'
import { FinanceProvider, useFinance } from './app/FinanceContext'
import { useSecurity } from './app/SecurityContext'
const DashboardPage = lazy(async () => ({
  default: (await import('./features/dashboard/DashboardPage')).DashboardPage,
}))
const TransactionsPage = lazy(async () => ({
  default: (await import('./features/transactions/TransactionsPage')).TransactionsPage,
}))
const PlanPage = lazy(async () => ({
  default: (await import('./features/plan/PlanPage')).PlanPage,
}))
const NetWorthPage = lazy(async () => ({
  default: (await import('./features/net-worth/NetWorthPage')).NetWorthPage,
}))
const LoansPage = lazy(async () => ({
  default: (await import('./features/loans/LoansPage')).LoansPage,
}))
const InvestmentsPage = lazy(async () => ({
  default: (await import('./features/investments/InvestmentsPage')).InvestmentsPage,
}))
const InsurancePage = lazy(async () => ({
  default: (await import('./features/insurance/InsurancePage')).InsurancePage,
}))
const GoalsPage = lazy(async () => ({
  default: (await import('./features/goals/GoalsPage')).GoalsPage,
}))
const ReportsPage = lazy(async () => ({
  default: (await import('./features/reports/ReportsPage')).ReportsPage,
}))
const AlertsPage = lazy(async () => ({
  default: (await import('./features/alerts/AlertsPage')).AlertsPage,
}))
const SettingsPage = lazy(async () => ({
  default: (await import('./features/settings/SettingsPage')).SettingsPage,
}))
const CalculatorsPage = lazy(async () => ({
  default: (await import('./features/calculators/CalculatorsPage')).CalculatorsPage,
}))

function FinanceApplication() {
  const { loading, error, refresh } = useFinance()
  if (loading) return <DataLoadingScreen />
  if (error) return <DataErrorScreen message={error} onRetry={() => void refresh()} />

  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="route-loading" aria-label="Loading section">
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/net-worth" element={<NetWorthPage />} />
          <Route path="/loans" element={<LoansPage />} />
          <Route path="/investments" element={<InvestmentsPage />} />
          <Route path="/insurance" element={<InsurancePage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/calculators" element={<CalculatorsPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}

function App() {
  const { status, workspace } = useSecurity()
  if (status === 'checking') return <CheckingScreen />
  if (status === 'setup') return <SetupScreen />
  if (status === 'locked' || !workspace) return <UnlockScreen />
  return (
    <FinanceProvider workspace={workspace}>
      <FinanceApplication />
    </FinanceProvider>
  )
}

export default App
