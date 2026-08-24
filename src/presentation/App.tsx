import { lazy, useMemo, type ReactNode } from 'react'
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
import { FirstTimeSetupResolver } from './components/FirstTimeSetupResolver'
import { GuestDataDecisionDialog } from './components/GuestDataDecisionDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RouteLoadingBoundary } from './components/RouteLoadingBoundary'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage'
import { MoreLandingPage, PlanningLandingPage } from './pages/AreaLandingPages'
import { InitialBalancePage } from './pages/setup/InitialBalancePage'
import { InitialPeriodPage } from './pages/setup/InitialPeriodPage'
import { WelcomePage } from './pages/setup/WelcomePage'

const MovementsPage = lazy(() =>
  import('./pages/MovementsPage').then(({ MovementsPage }) => ({
    default: MovementsPage,
  })),
)
const IncomeCreatePage = lazy(() =>
  import('./pages/IncomeCreatePage').then(({ IncomeCreatePage }) => ({
    default: IncomeCreatePage,
  })),
)
const ExpectedIncomeDetailPage = lazy(() =>
  import('./pages/ExpectedIncomeDetailPage').then(
    ({ ExpectedIncomeDetailPage }) => ({ default: ExpectedIncomeDetailPage }),
  ),
)
const ExpensesPage = lazy(() =>
  import('./pages/ExpensesPage').then(({ ExpensesPage }) => ({
    default: ExpensesPage,
  })),
)
const ReceiptCapturePage = lazy(() =>
  import('./pages/Receipts/ReceiptCapturePage').then(
    ({ ReceiptCapturePage }) => ({ default: ReceiptCapturePage }),
  ),
)
const CategoriesPage = lazy(() =>
  import('./pages/CategoriesPage').then(({ CategoriesPage }) => ({
    default: CategoriesPage,
  })),
)
const BudgetsPage = lazy(() =>
  import('./pages/BudgetsPage').then(({ BudgetsPage }) => ({
    default: BudgetsPage,
  })),
)
const ProjectionPage = lazy(() =>
  import('./pages/ProjectionPage').then(({ ProjectionPage }) => ({
    default: ProjectionPage,
  })),
)
const RecurringPaymentsPage = lazy(() =>
  import('./pages/RecurringPaymentsPage').then(({ RecurringPaymentsPage }) => ({
    default: RecurringPaymentsPage,
  })),
)
const RecurringPlanFormPage = lazy(() =>
  import('./pages/RecurringPlanFormPage').then(({ RecurringPlanFormPage }) => ({
    default: RecurringPlanFormPage,
  })),
)
const CommitmentDetailPage = lazy(() =>
  import('./pages/CommitmentDetailPage').then(({ CommitmentDetailPage }) => ({
    default: CommitmentDetailPage,
  })),
)
const InsightsPage = lazy(() =>
  import('./pages/InsightsPage').then(({ InsightsPage }) => ({
    default: InsightsPage,
  })),
)
const PeriodsPage = lazy(() =>
  import('./pages/PeriodsPage').then(({ PeriodsPage }) => ({
    default: PeriodsPage,
  })),
)
const PurchaseSimulatorPage = lazy(() =>
  import('./pages/PurchaseSimulatorPage').then(({ PurchaseSimulatorPage }) => ({
    default: PurchaseSimulatorPage,
  })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then(({ SettingsPage }) => ({
    default: SettingsPage,
  })),
)

function lazyRoute(page: ReactNode) {
  return <RouteLoadingBoundary>{page}</RouteLoadingBoundary>
}

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
            <Route path="/" element={<Navigate to="/inicio" replace />} />
            <Route element={<AuthEntryGuard />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
            </Route>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route element={<AuthGuard allowGuest />}>
              <Route element={<LocalDataProviders services={services} />}>
                <Route element={<FirstTimeSetupResolver />}>
                  <Route
                    path="configuracion-inicial"
                    element={<WelcomePage />}
                  />
                  <Route
                    path="configuracion-inicial/periodo"
                    element={<InitialPeriodPage />}
                  />
                  <Route
                    path="saldo/inicial"
                    element={<InitialBalancePage />}
                  />
                  <Route element={<AppLayout />}>
                    <Route path="inicio" element={<DashboardPage />} />
                    <Route
                      path="dashboard"
                      element={<Navigate to="/inicio" replace />}
                    />
                    <Route
                      path="movimientos"
                      element={lazyRoute(<MovementsPage />)}
                    />
                    <Route
                      path="movimientos/ingresos/nuevo"
                      element={lazyRoute(<IncomeCreatePage />)}
                    />
                    <Route
                      path="movimientos/ingresos/:id"
                      element={lazyRoute(<ExpectedIncomeDetailPage />)}
                    />
                    <Route path="plan" element={<PlanningLandingPage />} />
                    <Route path="mas" element={<MoreLandingPage />} />
                    <Route
                      path="insights"
                      element={lazyRoute(<InsightsPage />)}
                    />
                    <Route
                      path="periods"
                      element={<Navigate to="/plan/periodos" replace />}
                    />
                    <Route
                      path="plan/periodos"
                      element={lazyRoute(<PeriodsPage />)}
                    />
                    <Route
                      path="incomes"
                      element={
                        <Navigate to="/movimientos?tipo=ingresos" replace />
                      }
                    />
                    <Route
                      path="expenses"
                      element={lazyRoute(<ExpensesPage />)}
                    />
                    <Route
                      path="expenses/receipt"
                      element={lazyRoute(<ReceiptCapturePage />)}
                    />
                    <Route
                      path="categories"
                      element={
                        <Navigate to="/organizacion/categorias" replace />
                      }
                    />
                    <Route
                      path="organizacion/categorias"
                      element={lazyRoute(<CategoriesPage />)}
                    />
                    <Route
                      path="budgets"
                      element={<Navigate to="/plan/presupuestos" replace />}
                    />
                    <Route
                      path="plan/presupuestos"
                      element={lazyRoute(<BudgetsPage />)}
                    />
                    <Route
                      path="plan/proyeccion"
                      element={lazyRoute(<ProjectionPage />)}
                    />
                    <Route
                      path="recurring"
                      element={<Navigate to="/plan/compromisos" replace />}
                    />
                    <Route
                      path="plan/compromisos"
                      element={lazyRoute(<RecurringPaymentsPage />)}
                    />
                    <Route
                      path="plan/compromisos/planes/nuevo"
                      element={lazyRoute(<RecurringPlanFormPage />)}
                    />
                    <Route
                      path="plan/compromisos/planes/:id"
                      element={lazyRoute(<RecurringPlanFormPage />)}
                    />
                    <Route
                      path="plan/compromisos/:id"
                      element={lazyRoute(<CommitmentDetailPage />)}
                    />
                    <Route
                      path="simulator"
                      element={<Navigate to="/simulador" replace />}
                    />
                    <Route
                      path="simulador"
                      element={lazyRoute(<PurchaseSimulatorPage />)}
                    />
                    <Route
                      path="settings"
                      element={lazyRoute(<SettingsPage />)}
                    />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
