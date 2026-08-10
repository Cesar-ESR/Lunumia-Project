import { NavLink, Outlet } from 'react-router-dom'
import { SyncStatusIndicator } from '../components/SyncStatusIndicator'
import { UpdatePrompt } from '../components/UpdatePrompt'
import { AccountControls } from '../components/AccountControls'
import { usePeriod } from '../context/PeriodContext'
import { APP_MARK, APP_NAME } from '@shared/constants'

const navigation = [
  ['/dashboard', 'Resumen'],
  ['/insights', 'Insights'],
  ['/periods', 'Periodos'],
  ['/incomes', 'Ingresos'],
  ['/expenses', 'Gastos'],
  ['/categories', 'Categorías'],
  ['/budgets', 'Presupuestos'],
  ['/recurring', 'Recurrentes'],
  ['/simulator', 'Simulador'],
  ['/settings', 'Configuración'],
] as const

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav
      aria-label={mobile ? 'Navegación móvil' : 'Navegación principal'}
      className={mobile ? 'mobile-menu-links' : 'sidebar-nav'}
    >
      {navigation.map(([to, label]) => (
        <NavLink key={to} to={to}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AppLayout() {
  const { activePeriod, isLoading } = usePeriod()
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            {APP_MARK}
          </span>
          <div>
            <strong>{APP_NAME}</strong>
            <small>Finanzas sin ruido</small>
          </div>
        </div>
        <NavigationLinks />
        <AccountControls />
        <div className="sidebar-period">
          <span>Periodo activo</span>
          <strong>
            {isLoading
              ? 'Cargando…'
              : activePeriod
                ? `${activePeriod.startDate} — ${activePeriod.endDate}`
                : 'Sin periodo'}
          </strong>
        </div>
      </aside>
      <div className="app-column">
        <SyncStatusIndicator />
        <header className="mobile-header">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              {APP_MARK}
            </span>
            <strong>{APP_NAME}</strong>
          </div>
          <details className="mobile-menu">
            <summary aria-label="Abrir menú">Menú</summary>
            <div className="mobile-menu-panel">
              <NavigationLinks mobile />
              <AccountControls />
            </div>
          </details>
        </header>
        <main className="content">
          <Outlet />
        </main>
        <nav className="bottom-nav" aria-label="Accesos principales">
          <NavLink to="/dashboard">Resumen</NavLink>
          <NavLink to="/incomes">Ingresos</NavLink>
          <NavLink to="/expenses">Gastos</NavLink>
          <NavLink to="/recurring">Pagos</NavLink>
        </nav>
      </div>
      <UpdatePrompt />
    </div>
  )
}
