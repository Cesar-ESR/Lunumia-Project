import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { ReceiptRecognitionProposal } from '@application/use-cases/receipts'
import { ReceiptRecognitionError } from '@infrastructure/ocr'
import {
  validateReceiptAmount,
  type ReceiptAmountProposal,
} from '@domain/rules'
import { ReceiptImageError, type CapturedImage } from '@infrastructure/platform'
import type { ApplicationServices } from '../../../app/composition-root'
import {
  CATEGORY_ID,
  OWNER_ID,
  PERIOD_ID,
  createCategoryMock,
  createExpenseMock,
  createPeriodMock,
} from '../../test/test-factories'
import {
  ReceiptCaptureFlow,
  type ReceiptCaptureFlowProps,
} from './ReceiptCaptureFlow'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createCapturedImage(
  name = 'receipt',
  revokePreviewUrl = vi.fn(),
): CapturedImage {
  return {
    fileName: `${name}.jpg`,
    mimeType: 'image/jpeg',
    originalSizeBytes: 100,
    originalWidth: 1200,
    originalHeight: 800,
    compressedWidth: 1200,
    compressedHeight: 800,
    base64: `${name}-base64`,
    previewUrl: `blob:${name}`,
    revokePreviewUrl,
  }
}

function createProposal(
  overrides: Partial<ReceiptRecognitionProposal> = {},
): ReceiptRecognitionProposal {
  const amountProposal: ReceiptAmountProposal = {
    subtotal: 10_000,
    tax: 2_345,
    tip: null,
    discount: null,
    otherFees: null,
    total: 12_345,
    amountPaid: 12_345,
    amountEvidence: 'TOTAL $123.45',
    amountAmbiguous: false,
    currency: 'MXN',
    confidence: 0.92,
  }
  return {
    draft: {
      description: 'Mercado local',
      amount: 12345,
      date: '2026-07-10',
      categoryId: '',
      periodId: PERIOD_ID,
    },
    detectedCurrency: 'MXN',
    confidence: 0.92,
    amountProposal,
    amountValidation: validateReceiptAmount(amountProposal),
    ...overrides,
  }
}

function setup(
  overrides: Partial<ReceiptCaptureFlowProps> & {
    image?: CapturedImage
    proposal?: ReceiptRecognitionProposal
  } = {},
) {
  const image = overrides.image ?? createCapturedImage()
  const prepareImage = vi
    .fn<ApplicationServices['receipts']['prepareImage']['execute']>()
    .mockResolvedValue(image)
  const recognizeReceipt = vi
    .fn<ApplicationServices['receipts']['recognizeReceipt']['execute']>()
    .mockResolvedValue(overrides.proposal ?? createProposal())
  const createExpense = vi
    .fn<ApplicationServices['expenses']['createExpense']['execute']>()
    .mockResolvedValue(createExpenseMock())
  const props: ReceiptCaptureFlowProps = {
    ownerId: OWNER_ID,
    authStatus: 'authenticated',
    currency: 'MXN',
    categories: [createCategoryMock()],
    periods: [createPeriodMock()],
    activePeriodId: PERIOD_ID,
    receiptServices: {
      prepareImage: { execute: prepareImage },
      recognizeReceipt: { execute: recognizeReceipt },
    },
    createExpense: { execute: createExpense },
    onCreated: vi.fn(),
    onCancel: vi.fn(),
    onSignIn: vi.fn(),
    onManagePeriods: vi.fn(),
    ...overrides,
  }
  const view = render(<ReceiptCaptureFlow {...props} />)
  return {
    ...view,
    props,
    image,
    prepareImage,
    recognizeReceipt,
    createExpense,
    rerenderFlow(next: Partial<ReceiptCaptureFlowProps>) {
      Object.assign(props, next)
      view.rerender(<ReceiptCaptureFlow {...props} />)
    },
  }
}

async function openPreview(
  user: ReturnType<typeof userEvent.setup>,
  action: 'Tomar foto' | 'Elegir de galería' = 'Elegir de galería',
) {
  await user.click(screen.getByRole('button', { name: action }))
  await screen.findByAltText('Vista previa del recibo seleccionado')
}

async function openEditing(user: ReturnType<typeof userEvent.setup>) {
  await openPreview(user)
  await user.click(screen.getByRole('button', { name: 'Analizar recibo' }))
  await screen.findByRole('heading', { name: 'Datos del gasto' })
}

describe('ReceiptCaptureFlow - selección y vista previa', () => {
  it('explica el procesamiento remoto sin exponer proveedores', () => {
    setup()
    expect(screen.getByText('Privacidad del recibo')).toBeVisible()
    expect(
      screen.getByText(/imagen se envía temporalmente a un servicio remoto/i),
    ).toBeVisible()
    expect(screen.queryByText(/Supabase|Groq|Edge Function/i)).toBeNull()
  })

  it('llama cámara y galería exactamente una vez desde sus acciones', async () => {
    const user = userEvent.setup()
    const { prepareImage } = setup()
    await openPreview(user, 'Tomar foto')
    expect(prepareImage).toHaveBeenCalledWith('camera')
    expect(prepareImage).toHaveBeenCalledOnce()
  })

  it('usa galería exactamente una vez', async () => {
    const user = userEvent.setup()
    const { prepareImage } = setup()
    await openPreview(user)
    expect(prepareImage).toHaveBeenCalledWith('gallery')
    expect(prepareImage).toHaveBeenCalledOnce()
  })

  it('cancelar el selector conserva la vista sin mostrar error', async () => {
    const user = userEvent.setup()
    const { prepareImage } = setup()
    prepareImage.mockResolvedValueOnce(null)
    await user.click(screen.getByRole('button', { name: 'Tomar foto' }))
    expect(screen.getByText('¿Cómo quieres registrar el gasto?')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('muestra el error tipado de un archivo inválido y ofrece captura manual', async () => {
    const user = userEvent.setup()
    const { prepareImage } = setup()
    prepareImage.mockRejectedValueOnce(
      new ReceiptImageError('unsupported_type'),
    )
    await user.click(screen.getByRole('button', { name: 'Elegir de galería' }))
    expect(
      await screen.findByText('Selecciona una imagen JPEG o PNG.'),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Registrar manualmente' }),
    ).toBeEnabled()
  })

  it('muestra la imagen comprimida con alt, dimensiones y sin anunciar base64', async () => {
    const user = userEvent.setup()
    setup()
    await openPreview(user)
    const preview = screen.getByAltText('Vista previa del recibo seleccionado')
    expect(preview).toHaveAttribute('src', 'blob:receipt')
    expect(screen.getByText(/1200 × 800 px/)).toBeVisible()
    expect(screen.queryByText('receipt-base64')).not.toBeInTheDocument()
  })

  it('el doble clic no abre dos selectores', async () => {
    const user = userEvent.setup()
    const pending = deferred<CapturedImage | null>()
    const { prepareImage } = setup()
    prepareImage.mockReturnValueOnce(pending.promise)
    await user.dblClick(screen.getByRole('button', { name: 'Tomar foto' }))
    expect(prepareImage).toHaveBeenCalledOnce()
    pending.resolve(null)
  })

  it('reemplaza la imagen y revoca la vista previa anterior', async () => {
    const user = userEvent.setup()
    const revokeFirst = vi.fn()
    const first = createCapturedImage('first', revokeFirst)
    const second = createCapturedImage('second')
    const { prepareImage } = setup({ image: first })
    prepareImage.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    await openPreview(user)
    await user.click(screen.getByRole('button', { name: 'Elegir otra imagen' }))
    await waitFor(() =>
      expect(
        screen.getByAltText('Vista previa del recibo seleccionado'),
      ).toHaveAttribute('src', 'blob:second'),
    )
    expect(revokeFirst).toHaveBeenCalledOnce()
  })

  it('cancelar y desmontar revocan la Object URL', async () => {
    const user = userEvent.setup()
    const revoke = vi.fn()
    const flow = setup({ image: createCapturedImage('cancel', revoke) })
    await openPreview(user)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(revoke).toHaveBeenCalledOnce()
    flow.unmount()
    expect(revoke).toHaveBeenCalledOnce()
  })

  it('desmontar directamente libera la imagen retenida', async () => {
    const user = userEvent.setup()
    const revoke = vi.fn()
    const flow = setup({ image: createCapturedImage('unmount', revoke) })
    await openPreview(user)
    flow.unmount()
    expect(revoke).toHaveBeenCalledOnce()
  })
})

describe('ReceiptCaptureFlow - OCR y resultados tardíos', () => {
  it('sin conexión conserva la imagen y ofrece captura manual sin llamar OCR', async () => {
    const user = userEvent.setup()
    const { recognizeReceipt } = setup({
      authStatus: 'offline-authenticated',
    })
    await openPreview(user)
    await user.click(screen.getByRole('button', { name: 'Analizar recibo' }))
    expect(recognizeReceipt).not.toHaveBeenCalled()
    expect(
      screen.getByText(/análisis del recibo necesita internet/i),
    ).toBeVisible()
    expect(
      screen.getByAltText('Vista previa del recibo seleccionado'),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Registrar manualmente' }),
    ).toBeEnabled()
  })

  it('anuncia que el recibo está listo para revisión sin mover el foco', async () => {
    const user = userEvent.setup()
    setup()
    await openEditing(user)
    expect(
      screen.getByText(
        'Recibo analizado. Revisa los datos antes de crear el gasto.',
      ),
    ).toHaveAttribute('role', 'status')
    expect(
      screen.getByRole('heading', { name: 'Datos del gasto' }),
    ).not.toHaveFocus()
  })

  it('llama OCR una vez y muestra estado aria-live durante el análisis', async () => {
    const user = userEvent.setup()
    const pending = deferred<ReceiptRecognitionProposal>()
    const { recognizeReceipt } = setup()
    recognizeReceipt.mockReturnValueOnce(pending.promise)
    await openPreview(user)
    await user.dblClick(screen.getByRole('button', { name: 'Analizar recibo' }))
    expect(recognizeReceipt).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('Analizando recibo…')
    pending.resolve(createProposal())
  })

  it('prellena comercio, total en centavos y DateOnly sin cambiar de zona', async () => {
    const user = userEvent.setup()
    setup()
    await openEditing(user)
    expect(screen.getByLabelText('Descripción')).toHaveValue('Mercado local')
    expect(screen.getByLabelText('Monto (MXN)')).toHaveValue('123.45')
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-07-10')
    expect(screen.getByLabelText('Periodo')).toHaveValue(PERIOD_ID)
    expect(
      screen.getByRole('heading', { name: 'Validación del monto' }),
    ).toBeVisible()
    expect(screen.getByText('TOTAL $123.45')).toBeVisible()
    expect(screen.getByText('Listo para confirmar')).toBeVisible()
  })

  it('deja vacíos todos los campos OCR faltantes y no usa rawText', async () => {
    const user = userEvent.setup()
    const missing = createProposal()
    setup({
      proposal: createProposal({
        draft: {
          description: '',
          amount: null,
          date: '',
          categoryId: '',
          periodId: PERIOD_ID,
        },
        detectedCurrency: null,
        amountProposal: {
          ...missing.amountProposal,
          subtotal: null,
          tax: null,
          total: null,
          amountPaid: null,
          amountEvidence: null,
          currency: null,
        },
      }),
    })
    await openEditing(user)
    expect(screen.getByLabelText('Descripción')).toHaveValue('')
    expect(screen.getByLabelText('Monto (MXN)')).toHaveValue('')
    expect(screen.getByLabelText('Fecha')).toHaveValue('')
    expect(screen.queryByText(/rawText/i)).not.toBeInTheDocument()
    expect(screen.getByText(/No pudimos identificar el total/)).toBeVisible()
  })

  it.each([
    ['network_error', 'Sin conexión. Puedes registrar el gasto manualmente'],
    ['provider_timeout', 'El análisis tardó demasiado'],
    ['provider_unavailable', 'El reconocimiento no está disponible'],
    ['rate_limited', 'Se alcanzó temporalmente el límite'],
    ['invalid_provider_response', 'No pudimos interpretar el recibo'],
  ] as const)(
    'traduce %s a un mensaje y fallback seguros',
    async (kind, message) => {
      const user = userEvent.setup()
      const { recognizeReceipt } = setup()
      recognizeReceipt.mockRejectedValueOnce(new ReceiptRecognitionError(kind))
      await openPreview(user)
      await user.click(screen.getByRole('button', { name: 'Analizar recibo' }))
      expect(await screen.findByText(new RegExp(message))).toBeVisible()
      expect(
        screen.getByRole('button', { name: 'Registrar manualmente' }),
      ).toBeEnabled()
    },
  )

  it('timeout permite reintentar por teclado y conserva la imagen', async () => {
    const user = userEvent.setup()
    const { recognizeReceipt } = setup()
    recognizeReceipt
      .mockRejectedValueOnce(new ReceiptRecognitionError('provider_timeout'))
      .mockResolvedValueOnce(createProposal())
    await openPreview(user)
    await user.click(screen.getByRole('button', { name: 'Analizar recibo' }))
    const retry = await screen.findByRole('button', { name: 'Reintentar' })
    retry.focus()
    await user.keyboard('{Enter}')
    expect(
      await screen.findByRole('heading', { name: 'Datos del gasto' }),
    ).toBeVisible()
    expect(recognizeReceipt).toHaveBeenCalledTimes(2)
  })

  it('guest no llama OCR, no reintenta solo y puede registrar manualmente', async () => {
    const user = userEvent.setup()
    const { recognizeReceipt } = setup({ authStatus: 'guest' })
    await openPreview(user)
    await user.click(screen.getByRole('button', { name: 'Analizar recibo' }))
    expect(
      await screen.findByText(
        'Necesitas iniciar sesión para analizar recibos.',
      ),
    ).toBeVisible()
    expect(recognizeReceipt).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Registrar manualmente' }),
    )
    expect(
      screen.getByRole('heading', { name: 'Datos del gasto' }),
    ).toBeVisible()
  })

  it('no muestra mensajes técnicos de un error desconocido', async () => {
    const user = userEvent.setup()
    const { recognizeReceipt } = setup()
    recognizeReceipt.mockRejectedValueOnce(
      new Error('provider-secret at https://internal.example'),
    )
    await openPreview(user)
    await user.click(screen.getByRole('button', { name: 'Analizar recibo' }))
    expect(
      await screen.findByText('No se pudo analizar el recibo.'),
    ).toBeVisible()
    expect(
      screen.queryByText(/provider-secret|internal\.example/),
    ).not.toBeInTheDocument()
  })

  it('ignora un resultado tardío después de reemplazar la imagen', async () => {
    const user = userEvent.setup()
    const pending = deferred<ReceiptRecognitionProposal>()
    const first = createCapturedImage('first')
    const second = createCapturedImage('second')
    const { prepareImage, recognizeReceipt } = setup({ image: first })
    prepareImage.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    recognizeReceipt.mockReturnValueOnce(pending.promise)
    await openPreview(user)
    await user.click(screen.getByRole('button', { name: 'Analizar recibo' }))
    await user.click(screen.getByRole('button', { name: 'Elegir otra imagen' }))
    await waitFor(() =>
      expect(
        screen.getByAltText('Vista previa del recibo seleccionado'),
      ).toHaveAttribute('src', 'blob:second'),
    )
    pending.resolve(createProposal())
    await Promise.resolve()
    expect(
      screen.queryByRole('heading', { name: 'Datos del gasto' }),
    ).not.toBeInTheDocument()
  })

  it('ignora un resultado tardío tras desmontar', async () => {
    const user = userEvent.setup()
    const pending = deferred<ReceiptRecognitionProposal>()
    const { recognizeReceipt, unmount } = setup()
    recognizeReceipt.mockReturnValueOnce(pending.promise)
    await openPreview(user)
    await user.click(screen.getByRole('button', { name: 'Analizar recibo' }))
    unmount()
    pending.resolve(createProposal())
    await Promise.resolve()
  })
})

describe('ReceiptCaptureFlow - formulario y creación local-first', () => {
  it('permite editar todos los valores propuestos y exige categoría', async () => {
    const user = userEvent.setup()
    const { createExpense } = setup()
    await openEditing(user)
    await user.clear(screen.getByLabelText('Descripción'))
    await user.type(screen.getByLabelText('Descripción'), 'Comercio corregido')
    await user.clear(screen.getByLabelText('Monto (MXN)'))
    await user.type(screen.getByLabelText('Monto (MXN)'), '150.25')
    expect(
      screen.getByText('Monto corregido, listo para confirmar'),
    ).toBeVisible()
    await user.clear(screen.getByLabelText('Fecha'))
    await user.type(screen.getByLabelText('Fecha'), '2026-07-12')
    await user.selectOptions(screen.getByLabelText('Categoría'), CATEGORY_ID)
    await user.click(
      screen.getByRole('button', { name: 'Confirmar monto y guardar gasto' }),
    )
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Comercio corregido',
        amount: 15025,
        date: '2026-07-12',
        categoryId: CATEGORY_ID,
        periodId: PERIOD_ID,
      }),
    )
  })

  it('OCR no escribe y solo la confirmación explícita invoca CreateExpense', async () => {
    const user = userEvent.setup()
    const { createExpense } = setup()
    await openEditing(user)
    expect(createExpense).not.toHaveBeenCalled()
    await user.selectOptions(screen.getByLabelText('Categoría'), CATEGORY_ID)
    await user.click(
      screen.getByRole('button', {
        name: 'Confirmar monto y guardar gasto',
      }),
    )
    expect(createExpense).toHaveBeenCalledOnce()
  })

  it('muestra mismatch sin reemplazar el total detectado', async () => {
    const user = userEvent.setup()
    const mismatchProposal = createProposal()
    setup({
      proposal: createProposal({
        draft: { ...mismatchProposal.draft, amount: 15_000 },
        amountProposal: {
          ...mismatchProposal.amountProposal,
          total: 15_000,
          amountPaid: 15_000,
        },
      }),
    })
    await openEditing(user)
    expect(screen.getByLabelText('Monto (MXN)')).toHaveValue('150.00')
    expect(
      screen.getByText(/componentes detectados no parecen coincidir/),
    ).toBeVisible()
  })

  it.each(['', '0', '-10'])(
    'rechaza el importe inválido %j',
    async (amount) => {
      const user = userEvent.setup()
      const { createExpense } = setup()
      await openEditing(user)
      const input = screen.getByLabelText('Monto (MXN)')
      await user.clear(input)
      if (amount) await user.type(input, amount)
      await user.selectOptions(screen.getByLabelText('Categoría'), CATEGORY_ID)
      await user.click(
        screen.getByRole('button', { name: 'Confirmar monto y guardar gasto' }),
      )
      expect(
        screen.getByText('Escribe un monto positivo con máximo dos decimales.'),
      ).toBeVisible()
      expect(createExpense).not.toHaveBeenCalled()
    },
  )

  it('rechaza fecha inválida, explica ausencia de periodo y enfoca el primer error', async () => {
    const user = userEvent.setup()
    const { createExpense } = setup()
    await openEditing(user)
    await user.clear(screen.getByLabelText('Fecha'))
    await user.type(screen.getByLabelText('Fecha'), '2026-09-10')
    await user.selectOptions(screen.getByLabelText('Categoría'), CATEGORY_ID)
    await user.click(
      screen.getByRole('button', { name: 'Confirmar monto y guardar gasto' }),
    )
    expect(
      screen.getByText(/No existe un periodo para esta fecha/),
    ).toBeVisible()
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('muestra una solución comprensible cuando no existen periodos', async () => {
    const user = userEvent.setup()
    const { props } = setup({ periods: [], activePeriodId: null })
    await user.click(
      screen.getByRole('button', { name: 'Registrar manualmente' }),
    )
    expect(
      await screen.findByText('No hay un periodo disponible'),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Administrar periodos' }),
    )
    expect(props.onManagePeriods).toHaveBeenCalledOnce()
  })

  it('requiere revisión si la moneda difiere y no convierte el importe', async () => {
    const user = userEvent.setup()
    const { createExpense } = setup({
      proposal: createProposal({ detectedCurrency: 'USD' }),
    })
    await openEditing(user)
    expect(
      screen.getByText(/parece estar en USD.*configurada es MXN/),
    ).toBeVisible()
    const save = screen.getByRole('button', {
      name: 'Confirmar monto y guardar gasto',
    })
    expect(save).toBeDisabled()
    await user.click(screen.getByLabelText(/Revisé el importe/))
    await user.selectOptions(screen.getByLabelText('Categoría'), CATEGORY_ID)
    await user.click(save)
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12345 }),
    )
  })

  it('no advierte cuando la moneda coincide o no fue detectada', async () => {
    const user = userEvent.setup()
    setup({ proposal: createProposal({ detectedCurrency: null }) })
    await openEditing(user)
    expect(screen.queryByText(/parece estar en/)).not.toBeInTheDocument()
  })

  it('confianza baja comunica revisión sin bloquear el formulario', async () => {
    const user = userEvent.setup()
    const lowConfidence = createProposal()
    setup({
      proposal: createProposal({
        confidence: 0.2,
        amountProposal: { ...lowConfidence.amountProposal, confidence: 0.2 },
      }),
    })
    await openEditing(user)
    expect(
      screen.getByText(/lectura del monto no fue suficientemente clara/i),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Confirmar monto y guardar gasto' }),
    ).toBeEnabled()
  })

  it('el registro manual libera imagen y nunca llama OCR', async () => {
    const user = userEvent.setup()
    const revoke = vi.fn()
    const { recognizeReceipt } = setup({
      image: createCapturedImage('manual', revoke),
    })
    await openPreview(user)
    await user.click(
      screen.getByRole('button', { name: 'Registrar manualmente' }),
    )
    expect(revoke).toHaveBeenCalledOnce()
    expect(recognizeReceipt).not.toHaveBeenCalled()
    expect(
      screen.getByRole('heading', { name: 'Datos del gasto' }),
    ).toBeVisible()
  })

  it('crea exactamente un gasto, libera la imagen y muestra éxito local', async () => {
    const user = userEvent.setup()
    const revoke = vi.fn()
    const flow = setup({ image: createCapturedImage('save', revoke) })
    await openEditing(user)
    await user.selectOptions(screen.getByLabelText('Categoría'), CATEGORY_ID)
    await user.dblClick(
      screen.getByRole('button', { name: 'Confirmar monto y guardar gasto' }),
    )
    expect(flow.createExpense).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledOnce()
    expect(
      await screen.findByText('Gasto guardado en este dispositivo.'),
    ).toBeVisible()
    expect(flow.props.onCreated).toHaveBeenCalledOnce()
  })

  it('solo pasa campos de Expense: nunca imagen, base64 ni metadata OCR', async () => {
    const user = userEvent.setup()
    const { createExpense } = setup()
    await openEditing(user)
    await user.selectOptions(screen.getByLabelText('Categoría'), CATEGORY_ID)
    await user.click(
      screen.getByRole('button', { name: 'Confirmar monto y guardar gasto' }),
    )
    const payload = createExpense.mock.calls[0]?.[0]
    expect(payload).toEqual({
      ownerId: OWNER_ID,
      periodId: PERIOD_ID,
      categoryId: CATEGORY_ID,
      amount: 12345,
      description: 'Mercado local',
      date: '2026-07-10',
      affectsBalance: true,
    })
    expect(JSON.stringify(payload)).not.toMatch(
      /base64|preview|confidence|rawText/,
    )
  })

  it('conserva el formulario cuando CreateExpense falla y permite reintentar', async () => {
    const user = userEvent.setup()
    const { createExpense } = setup()
    createExpense
      .mockRejectedValueOnce(new Error('No se pudo guardar localmente.'))
      .mockResolvedValueOnce(createExpenseMock())
    await openEditing(user)
    await user.selectOptions(screen.getByLabelText('Categoría'), CATEGORY_ID)
    await user.click(
      screen.getByRole('button', { name: 'Confirmar monto y guardar gasto' }),
    )
    expect(
      await screen.findByText('No pudimos guardar el gasto.'),
    ).toBeVisible()
    expect(screen.queryByText('No se pudo guardar localmente.')).toBeNull()
    expect(screen.getByLabelText('Descripción')).toHaveValue('Mercado local')
    await user.click(
      screen.getByRole('button', { name: 'Confirmar monto y guardar gasto' }),
    )
    expect(createExpense).toHaveBeenCalledTimes(2)
  })

  it('cambiar de propietario limpia imagen y evita mostrar resultados del anterior', async () => {
    const user = userEvent.setup()
    const pending = deferred<ReceiptRecognitionProposal>()
    const revoke = vi.fn()
    const flow = setup({ image: createCapturedImage('owner-a', revoke) })
    flow.recognizeReceipt.mockReturnValueOnce(pending.promise)
    await openPreview(user)
    await user.click(screen.getByRole('button', { name: 'Analizar recibo' }))
    flow.rerenderFlow({ ownerId: 'guest:owner-b' })
    expect(revoke).toHaveBeenCalledOnce()
    pending.resolve(createProposal())
    await Promise.resolve()
    expect(screen.getByText('¿Cómo quieres registrar el gasto?')).toBeVisible()
    expect(screen.queryByDisplayValue('Mercado local')).not.toBeInTheDocument()
  })

  it('expone labels, errores relacionados y foco accesible', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(
      screen.getByRole('button', { name: 'Registrar manualmente' }),
    )
    expect(screen.getByLabelText('Monto (MXN)')).toBeVisible()
    expect(screen.getByLabelText('Descripción')).toHaveFocus()
    expect(screen.getByLabelText('Categoría')).toBeVisible()
    expect(screen.getByLabelText('Fecha')).toBeVisible()
    expect(screen.getByLabelText('Periodo')).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Confirmar monto y guardar gasto' }),
    )
    const amount = screen.getByLabelText('Monto (MXN)')
    expect(amount).toHaveAttribute(
      'aria-describedby',
      'receipt-expense-amount-error',
    )
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(amount).toHaveFocus()
    expect(screen.getByText(/monto positivo/)).toHaveAttribute('role', 'alert')
  })
})
