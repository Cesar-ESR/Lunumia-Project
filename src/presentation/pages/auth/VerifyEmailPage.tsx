import { Link, useLocation } from 'react-router-dom'
import { AuthPageLayout } from './AuthPageLayout'

export function VerifyEmailPage() {
  const location = useLocation()
  const state = location.state
  const email =
    state &&
    typeof state === 'object' &&
    'email' in state &&
    typeof state.email === 'string'
      ? state.email
      : null
  return (
    <AuthPageLayout
      eyebrow="Verifica tu correo"
      title="Revisa tu bandeja de entrada"
      description={
        email
          ? `Enviamos instrucciones a ${email}. Confirma tu dirección para activar la cuenta.`
          : 'Enviamos instrucciones para confirmar tu dirección y activar la cuenta.'
      }
      footer={<Link to="/login">Volver a iniciar sesión</Link>}
    >
      <p className="auth-help">
        La verificación se completa desde el enlace de Supabase. Lunumia no
        marca cuentas como verificadas desde el navegador.
      </p>
    </AuthPageLayout>
  )
}
