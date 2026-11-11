import { useState } from 'react'
import type { SyncContextValue } from '../context/SyncContext'
import { ConfirmDialog } from './ConfirmDialog'
import { Button } from './Button'
import { validatePeriodResolutionChoices } from '@application/services/PeriodOverlapResolution'
import { SyncFailure } from '@application/services/SyncCoordinator'

const labels = {
  expense: 'Gasto',
  income: 'Ingreso',
  recurringPaymentOccurrence: 'Ocurrencia',
  categoryBudget: 'Presupuesto',
}

export function PeriodResolutionNotice({ sync }: { sync: SyncContextValue }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [invalidRevision, setInvalidRevision] = useState<string | null>(null)
  const preview = sync.lastResult?.periodResolution
  if (!preview) return null
  const { plan, navigation } = preview
  const requiresRecalculation = invalidRevision === preview.revision
  const periodLabel = (id: string) => {
    const period = preview.navigationPeriods.find((row) => row.id === id)
    return period
      ? `${period.startDate} — ${period.endDate}`
      : 'Requiere revisión'
  }
  let requirement: string | null = null
  try {
    validatePeriodResolutionChoices(plan, choices, preview.existingBudgets)
    if (
      navigation.kind === 'REQUIRES_SELECTION' &&
      !preview.navigationPeriods.some((period) => period.id === selected)
    )
      requirement = 'Selecciona el periodo de navegación antes de continuar.'
  } catch (reason) {
    requirement =
      reason instanceof Error
        ? reason.message
        : 'Revisa los destinos pendientes.'
  }
  const canApplyResolution =
    !pending &&
    !requirement &&
    !requiresRecalculation &&
    sync.isOnline &&
    !!sync.resolvePeriodOverlap
  const apply = async () => {
    if (!canApplyResolution) return
    setPending(true)
    setError(null)
    try {
      if (!sync.resolvePeriodOverlap)
        throw new Error('La resolución no está disponible.')
      await sync.resolvePeriodOverlap(preview.operationId, {
        revision: preview.revision,
        destinations: choices,
        selectedPeriodId: selected || undefined,
      })
      setOpen(false)
    } catch (reason) {
      if (!(reason instanceof SyncFailure && reason.retryable))
        setInvalidRevision(preview.revision)
      setError(
        reason instanceof Error
          ? reason.message
          : 'No se pudo aplicar la resolución.',
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="ln-period-resolution">
      <p role="status">Hay un conflicto entre tus periodos.</p>
      <Button
        disabled={!sync.isOnline}
        onClick={() => {
          setChoices({})
          setSelected('')
          setError(null)
          // Closing/reopening the same revision does not validate a stale plan.
          setOpen(true)
        }}
      >
        Resolver conflicto
      </Button>
      <ConfirmDialog
        open={open}
        title="Resolver conflicto de periodos"
        description="Un periodo guardado en este dispositivo se superpone con periodos que ya existen en tu cuenta. Revisa cómo se organizarán tus registros antes de continuar la sincronización."
        confirmLabel="Aplicar resolución"
        destructive={false}
        isPending={pending}
        confirmDisabled={!canApplyResolution}
        onConfirm={() => void apply()}
        onCancel={() => {
          if (!pending) setOpen(false)
        }}
      >
        <div className="ln-period-resolution">
          <h3>Periodo local</h3>
          <p>
            {plan.localPeriod.startDate} — {plan.localPeriod.endDate}
          </p>
          <h3>Periodos ya sincronizados</h3>
          <ul>
            {plan.remotePeriods.map((period) => (
              <li key={period.id}>{periodLabel(period.id)}</li>
            ))}
          </ul>
          <h3>Cambios propuestos</h3>
          {plan.dependencies.map(
            ({
              dependency,
              classification,
              targetPeriodId,
              candidatePeriodIds,
            }) => {
              const key = `${dependency.kind}:${dependency.id}`
              return (
                <div key={key}>
                  <p>
                    {labels[dependency.kind]} ·{' '}
                    {dependency.date ?? dependency.categoryId}
                    {dependency.deletedAt ? ' (eliminado)' : ''}
                  </p>
                  {classification === 'AMBIGUOUS' ? (
                    <label>
                      Destino del presupuesto {dependency.categoryId}
                      <select
                        value={choices[key] ?? ''}
                        required
                        onChange={(event) =>
                          setChoices({ ...choices, [key]: event.target.value })
                        }
                      >
                        <option value="">Selecciona un periodo</option>
                        {candidatePeriodIds.map((id) => (
                          <option key={id} value={id}>
                            {periodLabel(id)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p>
                      {targetPeriodId
                        ? `→ ${periodLabel(targetPeriodId)}`
                        : 'Requiere revisión: no hay un periodo que contenga esta fecha.'}
                    </p>
                  )}
                </div>
              )
            },
          )}
          <h3>Periodo seleccionado después de resolver</h3>
          {navigation.kind === 'REQUIRES_SELECTION' ? (
            <label>
              Periodo de navegación
              <select
                value={selected}
                required
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Selecciona un periodo</option>
                {preview.navigationPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {periodLabel(period.id)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>
              {periodLabel(navigation.settings.activePeriodId ?? '')}
              {navigation.kind === 'REMOTE_NEWER'
                ? ' · conservar selección remota'
                : ''}
            </p>
          )}
          <p>
            El periodo incompatible se eliminará sólo de este dispositivo. No se
            modificarán importes ni fechas.
          </p>
          {requirement ? <p role="status">{requirement}</p> : null}
          {requiresRecalculation ? (
            <p role="status">
              Recalcula el conflicto antes de volver a aplicar.
            </p>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          {error || requiresRecalculation ? (
            <Button
              onClick={async () => {
                setOpen(false)
                await sync.syncNow()
              }}
            >
              Recalcular conflicto
            </Button>
          ) : null}
        </div>
      </ConfirmDialog>
    </div>
  )
}
