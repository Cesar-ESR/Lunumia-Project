import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Database,
  PieChart,
  TrendingUp,
  Settings,
  Tags,
  Calculator,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { InteractiveRow } from '../components/InteractiveRow'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'

interface Destination {
  to: string
  title: string
  description: string
  icon: ReactNode
}

function DestinationList({
  label,
  destinations,
}: {
  label: string
  destinations: Destination[]
}) {
  return (
    <Surface className="ln-destination-list" aria-label={label}>
      {destinations.map(({ to, title, description, icon }) => (
        <InteractiveRow
          key={to}
          leading={icon}
          action={
            <Link className="ln-row-link" to={to} aria-label={`Abrir ${title}`}>
              <ChevronRight aria-hidden="true" />
            </Link>
          }
        >
          <h3>{title}</h3>
          <p>{description}</p>
        </InteractiveRow>
      ))}
    </Surface>
  )
}

export function PlanningLandingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Área"
        title="Planificación"
        description="Organiza compromisos, presupuestos y periodos con las herramientas que ya están disponibles."
      />
      <DestinationList
        label="Destinos de Planificación"
        destinations={[
          {
            to: '/plan/compromisos',
            title: 'Compromisos',
            description: 'Administra pagos recurrentes y sus ocurrencias.',
            icon: <CalendarClock aria-hidden="true" />,
          },
          {
            to: '/plan/presupuestos',
            title: 'Presupuestos',
            description: 'Define montos por categoría para el periodo.',
            icon: <PieChart aria-hidden="true" />,
          },
          {
            to: '/plan/proyeccion',
            title: 'Proyección',
            description:
              'Consulta disponible, cierre estimado, horizonte y cobertura.',
            icon: <TrendingUp aria-hidden="true" />,
          },
          {
            to: '/plan/periodos',
            title: 'Periodos',
            description: 'Crea intervalos y elige cuál quieres consultar.',
            icon: <CalendarDays aria-hidden="true" />,
          },
        ]}
      />
    </>
  )
}

const moreGroups: Array<{ title: string; destinations: Destination[] }> = [
  {
    title: 'Entender',
    destinations: [
      {
        to: '/insights',
        title: 'Análisis',
        description: 'Explora cambios por categoría.',
        icon: <BarChart3 aria-hidden="true" />,
      },
      {
        to: '/simulador',
        title: 'Simulador',
        description: 'Evalúa una compra con tu información actual.',
        icon: <Calculator aria-hidden="true" />,
      },
    ],
  },
  {
    title: 'Organizar',
    destinations: [
      {
        to: '/plan/periodos',
        title: 'Periodos',
        description: 'Administra los intervalos de tu dinero.',
        icon: <CalendarDays aria-hidden="true" />,
      },
      {
        to: '/organizacion/categorias',
        title: 'Categorías',
        description: 'Organiza cómo clasificas tus gastos.',
        icon: <Tags aria-hidden="true" />,
      },
    ],
  },
  {
    title: 'Tus datos',
    destinations: [
      {
        to: '/settings#settings-data-title',
        title: 'Datos y respaldos',
        description: 'Exporta, importa y administra los datos locales.',
        icon: <Database aria-hidden="true" />,
      },
    ],
  },
  {
    title: 'Cuenta y aplicación',
    destinations: [
      {
        to: '/settings#settings-account-title',
        title: 'Configuración',
        description: 'Gestiona cuenta, instalación y preferencias disponibles.',
        icon: <Settings aria-hidden="true" />,
      },
    ],
  },
]

export function MoreLandingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Navegación"
        title="Más"
        description="Herramientas, organización, cuenta y datos en un solo lugar."
      />
      <div className="ln-more-groups">
        {moreGroups.map((group) => (
          <section key={group.title} aria-labelledby={`more-${group.title}`}>
            <h2 id={`more-${group.title}`}>{group.title}</h2>
            <DestinationList
              label={`Opciones de ${group.title}`}
              destinations={group.destinations}
            />
          </section>
        ))}
      </div>
    </>
  )
}
