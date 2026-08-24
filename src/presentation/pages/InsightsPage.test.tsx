import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { CalculatedCategoryChange } from '@domain/ports'
import type { ApplicationServices } from '../../app/composition-root'
import { ApplicationServicesProvider } from '../context/ApplicationServicesContext'
import { PeriodProvider } from '../context/PeriodContext'
import {
  createApplicationServicesMock,
  createPeriodMock,
  PERIOD_ID,
} from '../test/test-factories'
import { InsightsPage } from './InsightsPage'

const availability = vi.hoisted(() => ({ value: true }))

vi.mock('../hooks/useAIAvailability', () => ({
  useAIAvailability: () => availability.value,
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    ownerId: 'account-owner',
    user: { id: 'user-1', email: 'persona@example.com' },
  }),
}))

const previousPeriod = createPeriodMock({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
})

const change: CalculatedCategoryChange = {
  categoryId: '22222222-2222-4222-8222-222222222222',
  categoryName: 'Comida',
  currentAmount: 25000,
  previousAmount: 20000,
  absoluteChange: 5000,
  changePercentage: 25,
}

type ExplainCategoryChanges = NonNullable<
  ApplicationServices['aiInsights']
>['explainCategoryChanges']['execute']

function renderInsights({
  changes = [change],
  explain,
}: {
  changes?: CalculatedCategoryChange[]
  explain?: ExplainCategoryChanges
} = {}) {
  const explainAction =
    explain ??
    vi.fn<ExplainCategoryChanges>().mockResolvedValue([
      {
        categoryId: change.categoryId,
        explanation: 'Subió el gasto en comida.',
      },
    ])
  const result = createApplicationServicesMock()
  vi.mocked(result.services.periods.listPeriods.execute).mockResolvedValue([
    createPeriodMock(),
    previousPeriod,
  ])
  vi.mocked(
    result.services.aiData.prepareCategoryChanges.execute,
  ).mockResolvedValue(changes)
  result.services.aiInsights = {
    suggestExpenseCategory: { execute: vi.fn() },
    generatePeriodSummary: { execute: vi.fn() },
    explainCategoryChanges: { execute: explainAction },
    explainPlanning: { execute: vi.fn() },
  }
  render(
    <MemoryRouter>
      <ApplicationServicesProvider services={result.services}>
        <PeriodProvider>
          <InsightsPage />
        </PeriodProvider>
      </ApplicationServicesProvider>
    </MemoryRouter>,
  )
  return { ...result, explain: explainAction }
}

describe('InsightsPage U9', () => {
  beforeEach(() => {
    availability.value = true
  })

  it('presenta primero los datos de Lunumia y no solicita IA automáticamente', async () => {
    const { explain } = renderInsights()
    expect(
      await screen.findByRole('heading', { name: 'Cambios calculados' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Datos de Lunumia')).toBeInTheDocument()
    expect(screen.getByLabelText('$250.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$200.00')).toBeInTheDocument()
    expect(screen.getByLabelText('$50.00')).toBeInTheDocument()
    expect(explain).not.toHaveBeenCalled()
  })

  it('mantiene el loading dentro del panel de explicación', async () => {
    const user = userEvent.setup()
    let resolve!: (
      value: Array<{ categoryId: string; explanation: string }>,
    ) => void
    const explain = vi.fn<ExplainCategoryChanges>(
      () =>
        new Promise<Array<{ categoryId: string; explanation: string }>>(
          (next) => {
            resolve = next
          },
        ),
    )
    renderInsights({ explain })
    await user.click(
      await screen.findByRole('button', { name: 'Solicitar explicación' }),
    )
    const panel = screen
      .getByRole('heading', { name: 'Explicación con IA' })
      .closest('section')!
    expect(
      within(panel).getByText('Generando únicamente la explicación…'),
    ).toBeInTheDocument()
    expect(screen.getByText('Cambios calculados')).toBeInTheDocument()
    resolve([{ categoryId: change.categoryId, explanation: 'Explicación' }])
    expect(
      await screen.findByLabelText('Contenido generado por IA'),
    ).toBeInTheDocument()
  })

  it('separa visual y semánticamente el éxito de IA', async () => {
    const user = userEvent.setup()
    renderInsights()
    await user.click(
      await screen.findByRole('button', { name: 'Solicitar explicación' }),
    )
    const generated = await screen.findByLabelText('Contenido generado por IA')
    expect(
      within(generated).getByText('Subió el gasto en comida.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Esta explicación no modifica tus datos ni sustituye tus decisiones.',
      ),
    ).toBeInTheDocument()
  })

  it('conserva los facts si falla la IA', async () => {
    const user = userEvent.setup()
    renderInsights({
      explain: vi
        .fn<ExplainCategoryChanges>()
        .mockRejectedValue(new Error('falló')),
    })
    await user.click(
      await screen.findByRole('button', { name: 'Solicitar explicación' }),
    )
    expect(
      await screen.findByText('No pudimos generar la explicación'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('$250.00')).toBeInTheDocument()
  })

  it('no ofrece IA con un conjunto vacío', async () => {
    const { explain } = renderInsights({ changes: [] })
    expect(
      await screen.findByRole('heading', {
        name: 'Aún no hay suficiente actividad para analizar este periodo',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Solicitar explicación' }),
    ).toBeNull()
    expect(explain).not.toHaveBeenCalled()
  })

  it('usa el periodo seleccionado y etiqueta el selector de comparación', async () => {
    const { services } = renderInsights()
    expect(await screen.findByLabelText('Comparar con')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        services.aiData.prepareCategoryChanges.execute,
      ).toHaveBeenCalledWith(PERIOD_ID, previousPeriod.id),
    )
    expect(screen.getByText(/Periodo analizado:/)).toBeInTheDocument()
  })

  it('mantiene los facts cuando la IA no está disponible', async () => {
    availability.value = false
    renderInsights()
    expect(await screen.findByLabelText('$250.00')).toBeInTheDocument()
    expect(
      screen.getByText(/requiere una cuenta con sesión y conexión/),
    ).toBeInTheDocument()
  })
})
