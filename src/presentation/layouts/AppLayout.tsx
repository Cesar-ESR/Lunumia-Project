import {
  BarChart3,
  Calculator,
  CalendarDays,
  House,
  ListMinus,
  Menu,
  MoreHorizontal,
  Settings,
  UserCircle,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { APP_MARK, APP_NAME } from '@shared/constants'
import { AccountControls } from '../components/AccountControls'
import { RegistrationQuickAction } from '../components/RegistrationQuickAction'
import { RouteFocus } from '../components/RouteFocus'
import { SkipLink } from '../components/SkipLink'
import { SyncStatusIndicator } from '../components/SyncStatusIndicator'
import { UpdatePrompt } from '../components/UpdatePrompt'
import { usePeriod } from '../context/PeriodContext'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { useVirtualKeyboard } from '../hooks/useVirtualKeyboard'
import { requestDirtyNavigation } from '../utils/dirty-navigation'

interface NavigationItem {
  to: string
  label: string
  icon: LucideIcon
  activePrefixes: string[]
}

const principal: NavigationItem[] = [
  {
    to: '/inicio',
    label: 'Inicio',
    icon: House,
    activePrefixes: ['/inicio', '/dashboard'],
  },
  {
    to: '/movimientos',
    label: 'Movimientos',
    icon: ListMinus,
    activePrefixes: ['/movimientos', '/expenses', '/incomes'],
  },
  {
    to: '/plan',
    label: 'Planificación',
    icon: WalletCards,
    activePrefixes: ['/plan', '/recurring', '/budgets', '/periods'],
  },
]

const tools: NavigationItem[] = [
  {
    to: '/insights',
    label: 'Análisis',
    icon: BarChart3,
    activePrefixes: ['/insights'],
  },
  {
    to: '/simulador',
    label: 'Simulador',
    icon: Calculator,
    activePrefixes: ['/simulador', '/simulator'],
  },
]

const account: NavigationItem[] = [
  {
    to: '/settings',
    label: 'Configuración',
    icon: Settings,
    activePrefixes: ['/settings'],
  },
]

const mobileNavigation: NavigationItem[] = [
  principal[0]!,
  principal[1]!,
  { ...principal[2]!, label: 'Plan' },
  {
    to: '/mas',
    label: 'Más',
    icon: MoreHorizontal,
    activePrefixes: [
      '/mas',
      '/insights',
      '/simulador',
      '/simulator',
      '/organizacion',
      '/categories',
      '/settings',
    ],
  },
]

const allNavigation = [...principal, ...tools, ...account]
const screenNames = [
  ['/expenses/receipt', 'Escanear recibo'],
  ['/movimientos', 'Movimientos'],
  ['/plan/compromisos', 'Compromisos'],
  ['/plan/presupuestos', 'Presupuestos'],
  ['/plan/proyeccion', 'Proyección'],
  ['/plan/periodos', 'Periodos'],
  ['/plan', 'Planificación'],
  ['/mas', 'Más'],
  ['/inicio', 'Inicio'],
  ['/dashboard', 'Inicio'],
  ['/incomes', 'Ingresos'],
  ['/expenses', 'Gastos'],
  ['/recurring', 'Compromisos'],
  ['/budgets', 'Presupuestos'],
  ['/periods', 'Periodos'],
  ['/categories', 'Categorías'],
  ['/organizacion/categorias', 'Categorías'],
  ['/insights', 'Análisis'],
  ['/simulator', 'Simulador'],
  ['/simulador', 'Simulador'],
  ['/settings', 'Configuración'],
] as const

function isNavigationItemActive(
  pathname: string,
  item: Pick<NavigationItem, 'activePrefixes'>,
): boolean {
  return item.activePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

function NavigationLinks({
  items,
  pathname,
  className,
}: {
  items: NavigationItem[]
  pathname: string
  className?: string
}) {
  return (
    <div className={className}>
      {items.map(({ to, label, icon: Icon, activePrefixes }) => {
        const active = isNavigationItemActive(pathname, { activePrefixes })
        return (
          <Link
            key={to}
            to={to}
            title={label}
            aria-current={active ? 'page' : undefined}
            className={`ln-nav-link${active ? ' active' : ''}`}
          >
            <Icon aria-hidden="true" />
            <span className="ln-nav-link__label">{label}</span>
          </Link>
        )
      })}
    </div>
  )
}

function NavigationGroup({
  title,
  items,
  pathname,
}: {
  title: string
  items: NavigationItem[]
  pathname: string
}) {
  return (
    <div className="ln-nav-group">
      <p className="ln-nav-group__title">{title}</p>
      <NavigationLinks
        items={items}
        pathname={pathname}
        className="ln-sidebar-nav"
      />
    </div>
  )
}

export function AppLayout() {
  const services = useApplicationServices()
  const { activePeriod, isLoading } = usePeriod()
  const location = useLocation()
  const navigate = useNavigate()
  const keyboard = useVirtualKeyboard()
  const screenName =
    screenNames.find(
      ([path]) =>
        location.pathname === path || location.pathname.startsWith(`${path}/`),
    )?.[1] ?? APP_NAME
  const periodLabel = isLoading
    ? 'Cargando periodo…'
    : activePeriod
      ? `${activePeriod.startDate} — ${activePeriod.endDate}`
      : 'Sin periodo'
  const periodRelevant = !['/settings', '/mas'].some(
    (path) =>
      location.pathname === path || location.pathname.startsWith(`${path}/`),
  )

  useEffect(() => {
    let disposed = false
    let remove: (() => Promise<void>) | null = null
    void services.backButton
      .subscribe(({ canGoBack }) => {
        const dialogs = document.querySelectorAll<HTMLElement>(
          '[data-native-back-target]',
        )
        const dialog = dialogs.item(dialogs.length - 1)
        if (dialog) {
          dialog.dispatchEvent(new Event('lunumia:native-back'))
          return
        }
        const openDetails =
          document.querySelectorAll<HTMLDetailsElement>('details[open]')
        const details = openDetails.item(openDetails.length - 1)
        if (details) {
          details.open = false
          details.querySelector<HTMLElement>('summary')?.focus()
          return
        }
        const leave = () => {
          if (canGoBack) navigate(-1)
          else void services.backButton.exitApp()
        }
        if (!requestDirtyNavigation(leave)) leave()
      })
      .then((unsubscribe) => {
        if (disposed) void unsubscribe()
        else remove = unsubscribe
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      if (remove) void remove()
    }
  }, [navigate, services.backButton])

  const guardInternalLink = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    const anchor = (event.target as Element).closest<HTMLAnchorElement>(
      'a[href]',
    )
    if (
      !anchor ||
      anchor.target === '_blank' ||
      anchor.hasAttribute('download')
    )
      return
    const destination = new URL(anchor.href, window.location.href)
    if (destination.origin !== window.location.origin) return
    const next = `${destination.pathname}${destination.search}${destination.hash}`
    const current = `${location.pathname}${location.search}${location.hash}`
    if (next === current) return
    if (
      requestDirtyNavigation(() =>
        navigate(`${destination.pathname}${destination.search}`, {
          replace: anchor.dataset.replace === 'true',
        }),
      )
    )
      event.preventDefault()
  }

  return (
    <div
      className="ln-app-shell"
      data-keyboard-open={keyboard.open || undefined}
      style={
        {
          '--keyboard-offset': `${keyboard.offset}px`,
        } as CSSProperties
      }
      onClickCapture={guardInternalLink}
    >
      <SkipLink />
      <aside className="ln-sidebar" aria-label="Navegación lateral">
        <div className="ln-sidebar-brand">
          <span className="ln-brand-mark" aria-hidden="true">
            {APP_MARK}
          </span>
          <div className="ln-sidebar-brand__copy">
            <strong>{APP_NAME}</strong>
            <small>Finanzas sin ruido</small>
          </div>
        </div>
        <nav aria-label="Navegación principal">
          <NavigationGroup
            title="Principal"
            items={principal}
            pathname={location.pathname}
          />
          <NavigationGroup
            title="Herramientas"
            items={tools}
            pathname={location.pathname}
          />
          <NavigationGroup
            title="Cuenta y datos"
            items={account}
            pathname={location.pathname}
          />
        </nav>
        <div className="ln-sidebar-account">
          <div className="ln-sidebar-account__desktop">
            <AccountControls />
          </div>
          <details className="ln-account-menu ln-sidebar-account__tablet">
            <summary aria-label="Abrir opciones de cuenta">
              <UserCircle aria-hidden="true" />
            </summary>
            <div className="ln-account-menu__panel">
              <AccountControls />
            </div>
          </details>
        </div>
      </aside>

      <div className="ln-app-column">
        <header className="ln-context-bar">
          <div className="ln-context-bar__identity">
            <div className="ln-mobile-brand">
              <span className="ln-brand-mark" aria-hidden="true">
                {APP_MARK}
              </span>
              <strong>{APP_NAME}</strong>
            </div>
            <span className="ln-context-bar__screen">{screenName}</span>
          </div>
          <div className="ln-context-bar__utilities">
            {periodRelevant ? (
              <Link
                className="ln-period-context"
                to="/plan/periodos"
                title={periodLabel}
              >
                <CalendarDays aria-hidden="true" />
                <span>{periodLabel}</span>
              </Link>
            ) : null}
            <SyncStatusIndicator />
            <details className="ln-mobile-menu">
              <summary aria-label="Abrir más opciones">
                <Menu aria-hidden="true" />
              </summary>
              <div className="ln-mobile-menu__panel">
                <nav aria-label="Más opciones">
                  <NavigationLinks
                    items={allNavigation}
                    pathname={location.pathname}
                    className="ln-mobile-menu__links"
                  />
                </nav>
                <AccountControls />
              </div>
            </details>
          </div>
        </header>

        <main
          id="main-content"
          className="ln-content"
          tabIndex={-1}
          data-focus-fallback
        >
          <RouteFocus />
          <Outlet />
        </main>

        <RegistrationQuickAction />
        <nav className="ln-bottom-nav" aria-label="Accesos principales">
          <NavigationLinks
            items={mobileNavigation}
            pathname={location.pathname}
          />
        </nav>
      </div>
      <UpdatePrompt />
    </div>
  )
}
