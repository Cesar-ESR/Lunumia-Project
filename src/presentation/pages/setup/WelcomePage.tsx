import { CalendarClock, TrendingUp, WalletCards } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { SetupPageLayout } from './SetupPageLayout'

const valuePoints = [
  {
    label: 'Movimientos',
    title: 'Registra lo que entra y sale',
    description: 'Mantén tus ingresos y gastos organizados en un solo lugar.',
    icon: WalletCards,
  },
  {
    label: 'Panorama',
    title: 'Entiende cómo estás hoy',
    description: 'Consulta tu saldo, tus gastos y cómo va tu planificación.',
    icon: TrendingUp,
  },
  {
    label: 'Planificación',
    title: 'Mira lo que viene',
    description:
      'Considera ingresos esperados, compromisos y una proyección de tu situación.',
    icon: CalendarClock,
  },
] as const

export function WelcomePage() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <SetupPageLayout step="Paso 1 de 4" wide>
      <section className="ln-welcome-card" aria-labelledby="welcome-title">
        <header className="ln-welcome-intro">
          <p className="eyebrow">Bienvenido a Lunumia</p>
          <h1 id="welcome-title" tabIndex={-1}>
            Entiende tu dinero con más claridad
          </h1>
          <p>
            Lunumia te ayuda a organizar tus movimientos, entender tu situación
            actual y anticipar cómo pueden influir tus próximos ingresos y
            compromisos.
          </p>
        </header>

        <div className="ln-welcome-values">
          {valuePoints.map(({ label, title, description, icon: Icon }) => (
            <article className="ln-welcome-value" key={label}>
              <span className="ln-welcome-value__icon" aria-hidden="true">
                <Icon />
              </span>
              <div>
                <p className="ln-welcome-value__label">{label}</p>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>

        <footer className="ln-welcome-actions">
          <p>Puedes comenzar sin crear una cuenta.</p>
          <Button
            type="button"
            onClick={() =>
              navigate('/configuracion-inicial/periodo', {
                state: location.state,
              })
            }
          >
            Comenzar
          </Button>
        </footer>
      </section>
    </SetupPageLayout>
  )
}
