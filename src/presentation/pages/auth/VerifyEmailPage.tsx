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
          ? `Te enviamos a ${email} las instrucciones correspondientes para continuar con tu cuenta.`
          : 'Te enviamos las instrucciones correspondientes para continuar con tu cuenta.'
      }
    >
      <p className="auth-help">
        Puede ser una confirmación de cuenta o una recuperación de acceso.
      </p>
      <div className="auth-links">
        <Link to="/login">Iniciar sesión</Link>
        <Link to="/forgot-password">Restablecer contraseña</Link>
      </div>
    </AuthPageLayout>
  )
}
