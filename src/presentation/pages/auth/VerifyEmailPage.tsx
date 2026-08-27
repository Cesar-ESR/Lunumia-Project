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
      eyebrow="Cuenta"
      title="Revisa tu correo"
      description={
        email
          ? `Si esta dirección puede registrarse, recibirás un correo en ${email} para confirmar tu cuenta.`
          : 'Si la dirección puede registrarse, recibirás un correo para continuar.'
      }
    >
      <p className="auth-help">
        Si ya tenías una cuenta, puedes <Link to="/login">iniciar sesión</Link>{' '}
        o <Link to="/forgot-password">restablecer tu contraseña</Link>.
      </p>
    </AuthPageLayout>
  )
}
