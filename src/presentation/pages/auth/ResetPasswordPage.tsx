import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FormField } from '../../components/FormField'
import { Notice } from '../../components/Notice'
import { useAuth } from '../../context/AuthContext'
import { AuthPageLayout } from './AuthPageLayout'
import { authFormErrors } from './auth-form-utils'

export function ResetPasswordPage() {
  const auth = useAuth()
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (isPending) return
    setIsPending(true)
    setErrors({})
    setNotice(null)
    try {
      await auth.updatePassword({ password, passwordConfirmation })
      setPassword('')
      setPasswordConfirmation('')
      setCompleted(true)
    } catch (reason) {
      const fieldErrors = authFormErrors(reason)
      setErrors(fieldErrors)
      if (Object.keys(fieldErrors).length === 0)
        setNotice(
          'No fue posible actualizar la contraseña. Abre nuevamente el enlace de recuperación.',
        )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthPageLayout
      eyebrow="Nueva contraseña"
      title="Elige una contraseña nueva"
      description="El enlace de recuperación debe haber creado una sesión válida antes de continuar."
      footer={completed ? <Link to="/login">Ir a iniciar sesión</Link> : null}
    >
      {completed ? (
        <Notice
          tone="success"
          message="Tu contraseña fue actualizada correctamente."
        />
      ) : null}
      {notice ? <Notice tone="error" message={notice} /> : null}
      <form
        className="stack-form"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <FormField
          id="reset-password"
          label="Nueva contraseña"
          error={errors.password}
        >
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
        <FormField
          id="reset-confirmation"
          label="Confirmar contraseña"
          error={errors.passwordConfirmation}
        >
          <input
            id="reset-confirmation"
            type="password"
            autoComplete="new-password"
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
          />
        </FormField>
        <button className="button" type="submit" disabled={isPending}>
          {isPending ? 'Actualizando…' : 'Actualizar contraseña'}
        </button>
      </form>
    </AuthPageLayout>
  )
}
