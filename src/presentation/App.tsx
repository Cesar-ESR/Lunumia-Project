import { useMemo } from 'react'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from 'react-router-dom'
import {
  authRuntime,
  compositionRoot,
  createApplicationServices,
  type ApplicationServices,
  type AuthRuntime,
} from '../app/composition-root'
import { ApplicationServicesProvider } from './context/ApplicationServicesContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PeriodProvider } from './context/PeriodContext'
import { SyncProvider } from './context/SyncContext'
import { AuthGuard } from './components/AuthGuard'
import { AuthEntryGuard } from './components/AuthEntryGuard'
import { GuestDataDecisionDialog } from './components/GuestDataDecisionDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppLayout } from './layouts/AppLayout'
import { CategoriesPage } from './pages/CategoriesPage'
import { IncomesPage } from './pages/IncomesPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { BudgetsPage } from './pages/BudgetsPage'
import { RecurringPaymentsPage } from './pages/RecurringPaymentsPage'
import { PurchaseSimulatorPage } from './pages/PurchaseSimulatorPage'
import { DashboardPage } from './pages/DashboardPage'
import { InsightsPage } from './pages/InsightsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PeriodsPage } from './pages/PeriodsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ReceiptCapturePage } from './pages/Receipts'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage'

function LocalDataProviders({ services }: { services?: ApplicationServices }) {
  const auth = useAuth()
  const scopedServices = useMemo(
    () => services ?? createApplicationServices(auth.ownerId),
    [auth.ownerId, services],
  )
  return (
    <ApplicationServicesProvider services={scopedServices}>
      <SyncProvider orchestrator={scopedServices.syncOrchestrator}>
        <PeriodProvider key={scopedServices.ownerId}>
          <Outlet />
        </PeriodProvider>
      </SyncProvider>
    </ApplicationServicesProvider>
  )
}

export function App({
  services,
  authServices = authRuntime,
}: {
  services?: ApplicationServices
  authServices?: AuthRuntime | null
}) {
  const guestOwnerId = services?.ownerId ?? compositionRoot.ownerId
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider runtime={authServices} guestOwnerId={guestOwnerId}>
          <GuestDataDecisionDialog />
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route element={<AuthEntryGuard />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
            </Route>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route element={<AuthGuard allowGuest />}>
              <Route element={<LocalDataProviders services={services} />}>
                <Route element={<AppLayout />}>
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="insights" element={<InsightsPage />} />
                  <Route path="periods" element={<PeriodsPage />} />
                  <Route path="incomes" element={<IncomesPage />} />
                  <Route path="expenses" element={<ExpensesPage />} />
                  <Route
                    path="expenses/receipt"
                    element={<ReceiptCapturePage />}
                  />
                  <Route path="categories" element={<CategoriesPage />} />
                  <Route path="budgets" element={<BudgetsPage />} />
                  <Route path="recurring" element={<RecurringPaymentsPage />} />
                  <Route path="simulator" element={<PurchaseSimulatorPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
