import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { MoneyField } from '../../components/MoneyField'
import { Notice } from '../../components/Notice'
import { useApplicationServices } from '../../context/ApplicationServicesContext'
import { parseMoneyInputToCents } from '../../utils/money-input'
import { readInternalDestination } from '../../utils/first-time'
import { SetupPageLayout } from './SetupPageLayout'

type BalanceCheck = 'checking' | 'missing' | 'known' | 'error'

export function InitialBalancePage() {
  const services = useApplicationServices()
  const location = useLocation()
  const navigate = useNavigate()
  const destination = readInternalDestination(location.state)
  const [check, setCheck] = useState<BalanceCheck>('checking')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const inspectBalance = useCallback(async () => {
    setCheck('checking')
    setError(null)
    try {
      const snapshot = await services.dashboard.getFinancialSnapshot.execute()
      setCheck(snapshot.currentBalanceCents === null ? 'missing' : 'known')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos comprobar tu saldo actual.',
      )
      setCheck('error')
    }
  }, [services])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void inspectBalance(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [inspectBalance])

  useEffect(() => {
    if (check === 'known') navigate(destination, { replace: true })
  }, [check, destination, navigate])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    const cents = parseMoneyInputToCents(amount, true, true)
    if (cents === null) {
      setError('Escribe un saldo válido con hasta dos decimales.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await services.balance.setCurrentBalance.execute({
        ownerId: services.ownerId,
        amount: cents,
      })
      navigate(destination, { replace: true })
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos guardar tu saldo. Inténtalo nuevamente.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <SetupPageLayout step="Paso 4 de 4">
      <div className="ln-setup-card">
        <header>
          <p className="eyebrow">Saldo opcional</p>
          <h1 tabIndex={-1}>¿Quieres indicar tu saldo actual?</h1>
          <p>
            Esto ayuda a Lunumia a mostrar tu situación y proyecciones desde el
            inicio. Puedes hacerlo ahora o más adelante.
          </p>
        </header>
        {check === 'checking' || check === 'known' ? (
          <LoadingState message="Comprobando tu saldo actual…" />
        ) : check === 'error' ? (
          <ErrorState
            title="No pudimos comprobar tu saldo"
            message={error ?? 'Inténtalo nuevamente.'}
            onRetry={() => void inspectBalance()}
          />
        ) : error ? (
          <Notice tone="danger" title="Revisa tu saldo" message={error} />
        ) : null}
        {check === 'missing' ? (
          <form
            className="ln-setup-form"
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            <MoneyField
              id="initial-balance"
              label="Saldo actual"
              value={amount}
              error={error ?? undefined}
              hint="Puede ser positivo, cero o negativo."
              allowNegative
              onChange={(event) => {
                setAmount(event.target.value)
                setError(null)
              }}
            />
            <div className="ln-setup-actions">
              <Button
                type="submit"
                loading={pending}
                loadingLabel="Guardando saldo…"
              >
                Indicar saldo actual
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => navigate(destination, { replace: true })}
              >
                Hacerlo después
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </SetupPageLayout>
  )
}
