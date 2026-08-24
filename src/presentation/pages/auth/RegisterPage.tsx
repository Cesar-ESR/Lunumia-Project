import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormField } from '../../components/FormField'
import { Notice } from '../../components/Notice'
import { useAuth } from '../../context/AuthContext'
import { AuthPageLayout } from './AuthPageLayout'
import { authErrorMessage, authFormErrors } from './auth-form-utils'

export function RegisterPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
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
      const result = await auth.signUp({
        email,
        password,
        passwordConfirmation,
      })
      setPassword('')
      setPasswordConfirmation('')
      if (result.requiresEmailVerification)
        navigate('/verify-email', {
          state: { email: email.trim().toLowerCase() },
        })
      else if (!result.requiresGuestDecision)
        navigate('/inicio', { replace: true })
    } catch (reason) {
      const fieldErrors = authFormErrors(reason)
      setErrors(fieldErrors)
      if (Object.keys(fieldErrors).length === 0)
        setNotice(
          authErrorMessage(
            reason,
            'No fue posible crear la cuenta. Inténtalo nuevamente.',
          ),
        )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthPageLayout
      eyebrow="Cuenta nueva"
      title="Crea tu cuenta"
      description="Después de crear tu cuenta podrás conservar los datos guardados en este dispositivo."
      footer={<Link to="/login">Ya tengo una cuenta</Link>}
    >
      {!auth.isConfigured ? (
        <Notice
          tone="error"
          message="Supabase no está configurado en este entorno."
        />
      ) : null}
      {!navigator.onLine ? (
        <Notice
          tone="error"
          message="Crear una cuenta requiere conexión a Internet."
        />
      ) : null}
      {notice ? <Notice tone="error" message={notice} /> : null}
      <form
        className="stack-form"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <FormField id="register-email" label="Correo" error={errors.email}>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            value={email}
            aria-describedby={errors.email ? 'register-email-error' : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        <FormField
          id="register-password"
          label="Contraseña"
          error={errors.password}
          hint="Mínimo 8 caracteres."
        >
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            value={password}
            aria-describedby={
              errors.password
                ? 'register-password-error'
                : 'register-password-hint'
            }
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
        <FormField
          id="register-confirmation"
          label="Confirmar contraseña"
          error={errors.passwordConfirmation}
        >
          <input
            id="register-confirmation"
            type="password"
            autoComplete="new-password"
            value={passwordConfirmation}
            aria-describedby={
              errors.passwordConfirmation
                ? 'register-confirmation-error'
                : undefined
            }
            onChange={(event) => setPasswordConfirmation(event.target.value)}
          />
        </FormField>
        <button
          className="button"
          type="submit"
          disabled={isPending || !auth.isConfigured || !navigator.onLine}
        >
          {isPending ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
    </AuthPageLayout>
  )
}
