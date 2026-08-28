import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { MoneyField } from '../../components/MoneyField'
import { Notice } from '../../components/Notice'
import { useApplicationServices } from '../../context/ApplicationServicesContext'
import {
  formatCentsForInput,
  parseMoneyInputToCents,
} from '../../utils/money-input'
import { readInternalDestination } from '../../utils/first-time'
import { SetupPageLayout } from './SetupPageLayout'

type BalanceCheck = 'checking' | 'ready' | 'error'

export function InitialBalancePage() {
  const services = useApplicationServices()
  const location = useLocation()
  const navigate = useNavigate()
  const destination = readInternalDestination(location.state)
  const [check, setCheck] = useState<BalanceCheck>('checking')
  const [hasOpeningBalance, setHasOpeningBalance] = useState(false)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const inspectBalance = useCallback(async () => {
    setCheck('checking')
    setError(null)
    try {
      const snapshot = await services.dashboard.getFinancialSnapshot.execute()
      if (snapshot.openingBalanceCents !== null) {
        setHasOpeningBalance(true)
        setAmount(formatCentsForInput(snapshot.openingBalanceCents))
      }
      setCheck('ready')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos comprobar tu saldo inicial.',
      )
      setCheck('error')
    }
  }, [services])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void inspectBalance(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [inspectBalance])

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
      await services.balance.setOpeningBalance.execute({
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
          <h1 tabIndex={-1}>
            {hasOpeningBalance
              ? 'Actualiza tu saldo inicial'
              : '¿Quieres indicar tu saldo inicial?'}
          </h1>
          <p>
            Indica cuánto dinero tenías al comenzar. Este monto se sumará a tus
            movimientos registrados.
          </p>
        </header>
        {check === 'checking' ? (
          <LoadingState message="Comprobando tu saldo inicial…" />
        ) : check === 'error' ? (
          <ErrorState
            title="No pudimos comprobar tu saldo inicial"
            message={error ?? 'Inténtalo nuevamente.'}
            onRetry={() => void inspectBalance()}
          />
        ) : error ? (
          <Notice tone="danger" title="Revisa tu saldo" message={error} />
        ) : null}
        {check === 'ready' ? (
          <form
            className="ln-setup-form"
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            <MoneyField
              id="initial-balance"
              label="Saldo inicial"
              value={amount}
              error={error ?? undefined}
              hint="Se sumará a tus movimientos. Puede ser positivo, cero o negativo."
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
                {hasOpeningBalance
                  ? 'Actualizar saldo inicial'
                  : 'Guardar saldo inicial'}
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
