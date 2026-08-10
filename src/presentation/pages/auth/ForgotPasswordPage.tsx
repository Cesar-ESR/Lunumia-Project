import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FormField } from '../../components/FormField'
import { Notice } from '../../components/Notice'
import { useAuth } from '../../context/AuthContext'
import { AuthPageLayout } from './AuthPageLayout'
import { authFormErrors } from './auth-form-utils'

export function ForgotPasswordPage() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!auth.isConfigured || isPending) return
    setIsPending(true)
    setErrors({})
    try {
      await auth.requestPasswordReset({ email })
      setSent(true)
    } catch (reason) {
      const fieldErrors = authFormErrors(reason)
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors)
      else if (navigator.onLine) setSent(true)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthPageLayout
      eyebrow="Recuperación"
      title="Restablece tu acceso"
      description="Te enviaremos instrucciones si existe una cuenta asociada."
      footer={<Link to="/login">Volver a iniciar sesión</Link>}
    >
      {sent ? (
        <Notice
          tone="success"
          message="Si existe una cuenta asociada, recibirás instrucciones para restablecer tu contraseña."
        />
      ) : null}
      {!navigator.onLine ? (
        <Notice
          tone="error"
          message="Solicitar recuperación requiere conexión a Internet."
        />
      ) : null}
      <form
        className="stack-form"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <FormField id="forgot-email" label="Correo" error={errors.email}>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        <button
          className="button"
          type="submit"
          disabled={isPending || !auth.isConfigured || !navigator.onLine}
        >
          {isPending ? 'Enviando…' : 'Enviar instrucciones'}
        </button>
      </form>
    </AuthPageLayout>
  )
}
