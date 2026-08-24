import { useEffect, useRef, useState } from 'react'
import type { AuthStatus } from '@application/services/AuthClient'
import { createManualReceiptDraft } from '@application/use-cases/receipts'
import type { ReceiptImageSource } from '../../../app/receipt-workflow'
import type { Category, Period } from '@domain/entities'
import type { ApplicationServices } from '../../../app/composition-root'
import { getLocalDateOnly } from '@shared/utils/date'
import {
  ExpenseForm,
  type ExpenseFormValue,
} from '../../components/ExpenseForm'
import { Notice } from '../../components/Notice'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { CurrencyMismatchWarning } from './CurrencyMismatchWarning'
import { ReceiptErrorPanel } from './ReceiptErrorPanel'
import { ReceiptPreview } from './ReceiptPreview'
import { ReceiptSourceSelector } from './ReceiptSourceSelector'
import { ReceiptAmountValidationSection } from './ReceiptAmountValidationSection'
import type { ReceiptFlowState, ReceiptFormContext } from './receipt-flow-state'
import { toReceiptFlowFailure } from './receipt-flow-errors'

export interface ReceiptCaptureFlowProps {
  ownerId: string
  authStatus: AuthStatus
  currency: string
  categories: Category[]
  periods: Period[]
  activePeriodId: string | null
  receiptServices: ApplicationServices['receipts']
  createExpense: ApplicationServices['expenses']['createExpense']
  onCreated(): void
  onCancel(): void
  onSignIn(): void
  onManagePeriods(): void
}

export function ReceiptCaptureFlow({
  ownerId,
  authStatus,
  currency,
  categories,
  periods,
  activePeriodId,
  receiptServices,
  createExpense,
  onCreated,
  onCancel,
  onSignIn,
  onManagePeriods,
}: ReceiptCaptureFlowProps) {
  const [state, setState] = useState<ReceiptFlowState>({ status: 'idle' })
  const [currencyReviewed, setCurrencyReviewed] = useState(false)
  const imageRef = useRef<ReceiptFormContext['image']>(null)
  const mountedRef = useRef(true)
  const generationRef = useRef(0)
  const selectingRef = useRef(false)
  const recognizingRef = useRef(false)
  const submittingRef = useRef(false)
  const ownerRef = useRef(ownerId)

  const releaseCurrentImage = () => {
    const image = imageRef.current
    imageRef.current = null
    image?.revokePreviewUrl()
  }

  const invalidatePendingWork = () => {
    generationRef.current += 1
    recognizingRef.current = false
  }

  useEffect(() => {
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      imageRef.current?.revokePreviewUrl()
      imageRef.current = null
    }
  }, [])

  useEffect(() => {
    if (ownerRef.current === ownerId) return
    ownerRef.current = ownerId
    invalidatePendingWork()
    releaseCurrentImage()
    setCurrencyReviewed(false)
    setState({ status: 'idle' })
  }, [ownerId])

  const selectImage = async (source: ReceiptImageSource) => {
    if (selectingRef.current) return
    selectingRef.current = true
    invalidatePendingWork()
    const generation = generationRef.current
    const previousImage = imageRef.current
    setState({ status: 'selecting', source, image: previousImage })
    try {
      const nextImage = await receiptServices.prepareImage.execute(source)
      if (!mountedRef.current || generation !== generationRef.current) {
        nextImage?.revokePreviewUrl()
        return
      }
      if (!nextImage) {
        setState(
          previousImage
            ? { status: 'preview', image: previousImage }
            : { status: 'idle' },
        )
        return
      }
      previousImage?.revokePreviewUrl()
      imageRef.current = nextImage
      setCurrencyReviewed(false)
      setState({ status: 'preview', image: nextImage })
    } catch (reason) {
      if (!mountedRef.current || generation !== generationRef.current) return
      setState({
        status: 'error',
        image: previousImage,
        failure: toReceiptFlowFailure(reason),
      })
    } finally {
      selectingRef.current = false
    }
  }

  const recognizeReceipt = async () => {
    const image = imageRef.current
    if (!image || recognizingRef.current) return
    if (!['authenticated', 'offline-authenticated'].includes(authStatus)) {
      setState({
        status: 'error',
        image,
        failure: {
          kind: 'unauthenticated',
          message: 'Necesitas iniciar sesión para analizar recibos.',
          canRetryRecognition: false,
        },
      })
      return
    }
    if (authStatus === 'offline-authenticated') {
      setState({
        status: 'error',
        image,
        failure: {
          kind: 'network_error',
          message:
            'Sin conexión. El análisis del recibo necesita internet, pero puedes registrar el gasto manualmente.',
          canRetryRecognition: false,
        },
      })
      return
    }
    recognizingRef.current = true
    const generation = ++generationRef.current
    setState({ status: 'recognizing', image })
    try {
      const proposal = await receiptServices.recognizeReceipt.execute(
        image,
        periods,
        activePeriodId,
      )
      if (!mountedRef.current || generation !== generationRef.current) return
      setCurrencyReviewed(false)
      setState({
        status: 'editing',
        image,
        ...proposal,
      })
    } catch (reason) {
      if (!mountedRef.current || generation !== generationRef.current) return
      setState({
        status: 'error',
        image,
        failure: toReceiptFlowFailure(reason),
      })
    } finally {
      if (generation === generationRef.current) recognizingRef.current = false
    }
  }

  const startManualEntry = () => {
    invalidatePendingWork()
    releaseCurrentImage()
    setCurrencyReviewed(false)
    setState({
      status: 'editing',
      image: null,
      draft: createManualReceiptDraft(
        getLocalDateOnly(),
        periods,
        activePeriodId,
      ),
      detectedCurrency: null,
      confidence: null,
      amountProposal: null,
      amountValidation: null,
    })
  }

  const cancelFlow = () => {
    invalidatePendingWork()
    releaseCurrentImage()
    setCurrencyReviewed(false)
    setState({ status: 'idle' })
    onCancel()
  }

  const submitExpense = async (
    value: ExpenseFormValue,
    context: ReceiptFormContext,
  ) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setState({ status: 'submitting', ...context })
    try {
      await createExpense.execute(value)
    } catch (reason) {
      if (mountedRef.current && ownerRef.current === ownerId)
        setState({ status: 'editing', ...context })
      throw new Error('No pudimos guardar el gasto.', { cause: reason })
    } finally {
      submittingRef.current = false
    }
    if (!mountedRef.current || ownerRef.current !== ownerId) return
    invalidatePendingWork()
    releaseCurrentImage()
    setState({ status: 'success' })
    onCreated()
  }

  const formContext =
    state.status === 'editing' || state.status === 'submitting' ? state : null
  const mismatch = Boolean(
    formContext?.detectedCurrency && formContext.detectedCurrency !== currency,
  )
  const fallbackPeriod = formContext
    ? (periods.find((period) => period.id === formContext.draft.periodId) ??
      periods[0])
    : undefined
  const interactivePreviewImage =
    state.status === 'preview' || state.status === 'recognizing'
      ? state.image
      : state.status === 'selecting'
        ? state.image
        : null

  if (state.status === 'success')
    return (
      <Notice message="Gasto guardado en este dispositivo." role="status" />
    )

  return (
    <div className="ln-receipt-flow">
      <Surface variant="subtle" className="ln-receipt-privacy">
        <strong>Privacidad del recibo</strong>
        <p>
          Para analizarlo, la imagen se envía temporalmente a un servicio
          remoto. Lunumia no guarda la imagen del recibo.
        </p>
      </Surface>

      {state.status === 'idle' ||
      (state.status === 'selecting' && !state.image) ? (
        <ReceiptSourceSelector
          isSelecting={state.status === 'selecting'}
          onCamera={() => void selectImage('camera')}
          onGallery={() => void selectImage('gallery')}
          onManual={startManualEntry}
          onCancel={cancelFlow}
        />
      ) : null}

      {interactivePreviewImage ? (
        <ReceiptPreview
          image={interactivePreviewImage}
          isRecognizing={state.status === 'recognizing'}
          isSelecting={state.status === 'selecting'}
          canAnalyze
          onAnalyze={() => void recognizeReceipt()}
          onReplace={() => void selectImage('gallery')}
          onManual={startManualEntry}
          onCancel={cancelFlow}
        />
      ) : null}

      {state.status === 'error' ? (
        <div className={state.image ? 'ln-receipt-workspace' : undefined}>
          {state.image ? <ReceiptPreview image={state.image} readonly /> : null}
          <ReceiptErrorPanel
            failure={state.failure}
            onRetry={state.image ? () => void recognizeReceipt() : undefined}
            onReplace={() => void selectImage('gallery')}
            onManual={startManualEntry}
            onCancel={cancelFlow}
            onSignIn={onSignIn}
          />
        </div>
      ) : null}

      {formContext ? (
        periods.length && fallbackPeriod ? (
          <div
            className={formContext.image ? 'ln-receipt-workspace' : undefined}
          >
            {formContext.image ? (
              <ReceiptPreview image={formContext.image} readonly />
            ) : null}
            <Surface
              className="ln-receipt-expense-form"
              aria-labelledby="receipt-form-title"
            >
              <p className="eyebrow">Revisa antes de guardar</p>
              <h2 id="receipt-form-title">Datos del gasto</h2>
              <p>
                El reconocimiento solo propone valores. Corrige cualquier dato
                antes de confirmar.
              </p>
              {formContext.image ? (
                <p className="sr-only" role="status" aria-live="polite">
                  Recibo analizado. Revisa los datos antes de crear el gasto.
                </p>
              ) : null}
              <ExpenseForm
                ownerId={ownerId}
                period={fallbackPeriod}
                periods={periods}
                categories={categories}
                initialValues={formContext.draft}
                currency={currency}
                submitLabel="Confirmar monto y guardar gasto"
                submitDisabled={
                  state.status === 'submitting' ||
                  (mismatch && !currencyReviewed)
                }
                resetOnSuccess={false}
                focusOnMount
                idPrefix="receipt-expense"
                beforeFields={({ amountCents }) => (
                  <>
                    <ReceiptAmountValidationSection
                      proposal={formContext.amountProposal}
                      amountCents={amountCents}
                      configuredCurrency={currency}
                    />
                    {mismatch && formContext.detectedCurrency ? (
                      <CurrencyMismatchWarning
                        detectedCurrency={formContext.detectedCurrency}
                        configuredCurrency={currency}
                        reviewed={currencyReviewed}
                        onReviewedChange={setCurrencyReviewed}
                      />
                    ) : null}
                    <div className="ln-receipt-currency-field">
                      <span>Moneda del gasto</span>
                      <strong>{currency}</strong>
                    </div>
                  </>
                )}
                onSubmit={(value) => submitExpense(value, formContext)}
                onCancel={cancelFlow}
              />
            </Surface>
          </div>
        ) : (
          <Surface className="ln-receipt-error" role="alert">
            <h2>No hay un periodo disponible</h2>
            <p>
              Crea un periodo que incluya la fecha del gasto y vuelve a
              intentarlo.
            </p>
            <div className="ln-receipt-actions">
              <Button onClick={onManagePeriods}>Administrar periodos</Button>
              <Button variant="ghost" onClick={cancelFlow}>
                Cancelar
              </Button>
            </div>
          </Surface>
        )
      ) : null}
    </div>
  )
}
