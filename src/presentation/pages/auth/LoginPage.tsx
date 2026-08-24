import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FormField } from '../../components/FormField'
import { Notice } from '../../components/Notice'
import { useAuth } from '../../context/AuthContext'
import { AuthPageLayout } from './AuthPageLayout'
import { authErrorMessage, authFormErrors } from './auth-form-utils'

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (isPending) return
    setIsPending(true)
    setErrors({})
    setNotice(null)
    try {
      const result = await auth.signIn({ email, password })
      setPassword('')
      if (!result.requiresGuestDecision) {
        const state = location.state
        const destination =
          state &&
          typeof state === 'object' &&
          'from' in state &&
          typeof state.from === 'string'
            ? state.from
            : '/inicio'
        navigate(destination, { replace: true })
      }
    } catch (reason) {
      const fieldErrors = authFormErrors(reason)
      setErrors(fieldErrors)
      if (Object.keys(fieldErrors).length === 0)
        setNotice(
          authErrorMessage(
            reason,
            'No fue posible iniciar sesión. Revisa tus datos e inténtalo nuevamente.',
          ),
        )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthPageLayout
      eyebrow="Acceso"
      title="Inicia sesión"
      description="Accede a la copia local asociada a tu cuenta."
    >
      {!auth.isConfigured ? (
        <Notice
          tone="error"
          message="Supabase no está configurado en este entorno. Puedes continuar como invitado."
        />
      ) : null}
      {!navigator.onLine ? (
        <Notice
          tone="error"
          message="Iniciar sesión por primera vez requiere conexión a Internet."
        />
      ) : null}
      {auth.error ? <Notice tone="error" message={auth.error} /> : null}
      {notice ? <Notice tone="error" message={notice} /> : null}
      <form
        className="stack-form"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <FormField id="login-email" label="Correo" error={errors.email}>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        <FormField
          id="login-password"
          label="Contraseña"
          error={errors.password}
        >
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            aria-describedby={
              errors.password ? 'login-password-error' : undefined
            }
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
        <button
          className="button"
          type="submit"
          disabled={isPending || !auth.isConfigured || !navigator.onLine}
        >
          {isPending ? 'Ingresando…' : 'Iniciar sesión'}
        </button>
      </form>
      <div className="auth-links">
        <Link to="/forgot-password">Olvidé mi contraseña</Link>
        <Link to="/register">Crear cuenta</Link>
        <Link to="/inicio">Continuar como invitado</Link>
      </div>
    </AuthPageLayout>
  )
}
