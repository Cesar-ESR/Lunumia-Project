import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { PeriodOverlapError } from '@domain/errors'
import { ApplicationServicesProvider } from '../context/ApplicationServicesContext'
import { PeriodProvider } from '../context/PeriodContext'
import {
  createApplicationServicesMock,
  createCategoryMock,
  createPeriodMock,
} from '../test/test-factories'
import { CategoriesPage } from './CategoriesPage'
import { PeriodsPage } from './PeriodsPage'

function renderPeriods() {
  const result = createApplicationServicesMock()
  render(
    <MemoryRouter>
      <ApplicationServicesProvider services={result.services}>
        <PeriodProvider>
          <PeriodsPage />
        </PeriodProvider>
      </ApplicationServicesProvider>
    </MemoryRouter>,
  )
  return result
}

function renderCategories() {
  const result = createApplicationServicesMock()
  render(
    <MemoryRouter>
      <ApplicationServicesProvider services={result.services}>
        <CategoriesPage />
      </ApplicationServicesProvider>
    </MemoryRouter>,
  )
  return result
}

describe('Periodos U9', () => {
  it('crea un periodo con DateOnly sin reinterpretar fechas', async () => {
    const user = userEvent.setup()
    const { services } = renderPeriods()
    await screen.findByRole('heading', { name: 'Periodos disponibles' })
    await user.selectOptions(screen.getByLabelText(/Tipo/), 'biweekly')
    await user.type(screen.getByLabelText(/Fecha inicial/), '2026-08-01')
    await user.type(screen.getByLabelText(/Fecha final/), '2026-08-15')
    await user.click(screen.getByRole('button', { name: 'Crear periodo' }))
    await waitFor(() =>
      expect(services.periods.createPeriod.execute).toHaveBeenCalledWith({
        ownerId: services.ownerId,
        type: 'biweekly',
        startDate: '2026-08-01',
        endDate: '2026-08-15',
      }),
    )
  })

  it('presenta el overlap del contrato en lenguaje humano', async () => {
    const user = userEvent.setup()
    const { services } = renderPeriods()
    vi.mocked(services.periods.createPeriod.execute).mockRejectedValue(
      new PeriodOverlapError(),
    )
    await screen.findByRole('heading', { name: 'Periodos disponibles' })
    await user.type(screen.getByLabelText(/Fecha inicial/), '2026-07-01')
    await user.type(screen.getByLabelText(/Fecha final/), '2026-07-15')
    await user.click(screen.getByRole('button', { name: 'Crear periodo' }))
    expect(
      await screen.findByText(
        'Este periodo se superpone con otro periodo existente.',
      ),
    ).toBeInTheDocument()
  })

  it('selecciona un periodo como contexto de navegación', async () => {
    const user = userEvent.setup()
    const result = createApplicationServicesMock()
    const second = createPeriodMock({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    vi.mocked(result.services.periods.listPeriods.execute).mockResolvedValue([
      createPeriodMock(),
      second,
    ])
    render(
      <MemoryRouter>
        <ApplicationServicesProvider services={result.services}>
          <PeriodProvider>
            <PeriodsPage />
          </PeriodProvider>
        </ApplicationServicesProvider>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Seleccionar' }))
    expect(
      result.services.periods.setActivePeriod.execute,
    ).toHaveBeenCalledWith(second.id)
    expect(
      await screen.findByText(
        'Periodo seleccionado para navegar por el plan y la actividad.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/no redefine por sí sola el periodo vigente/),
    ).toBeInTheDocument()
  })

  it('edita y elimina mediante los writers existentes', async () => {
    const user = userEvent.setup()
    const { services } = renderPeriods()
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText(/Fecha final/))
    await user.type(screen.getByLabelText(/Fecha final/), '2026-07-30')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() =>
      expect(services.periods.updatePeriod.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ endDate: '2026-07-30' }),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    const dialog = screen.getByRole('dialog', { name: 'Eliminar periodo' })
    await user.click(
      within(dialog).getByRole('button', { name: 'Eliminar periodo' }),
    )
    await waitFor(() =>
      expect(services.periods.deletePeriod.execute).toHaveBeenCalled(),
    )
  })
})

describe('Categorías U9', () => {
  it('crea y edita una categoría usando sus contratos', async () => {
    const user = userEvent.setup()
    const { services } = renderCategories()
    await screen.findByRole('heading', { name: 'Tus categorías' })
    await user.type(screen.getByLabelText('Nombre'), 'Transporte')
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }))
    await waitFor(() =>
      expect(services.categories.createCategory.execute).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Transporte' }),
      ),
    )
    const personal = await screen.findByLabelText('Categoría Comida')
    await user.click(within(personal).getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'Alimentos')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() =>
      expect(services.categories.updateCategory.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ name: 'Alimentos' }),
      ),
    )
  })

  it('explica y oculta acciones prohibidas para la categoría protegida', async () => {
    const { services } = createApplicationServicesMock()
    vi.mocked(services.categories.listCategories.execute).mockResolvedValue([
      createCategoryMock({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'Sin categoría',
        normalizedName: 'sin categoria',
        isSystem: true,
      }),
    ])
    render(
      <MemoryRouter>
        <ApplicationServicesProvider services={services}>
          <CategoriesPage />
        </ApplicationServicesProvider>
      </MemoryRouter>,
    )
    const protectedCategory = await screen.findByLabelText(
      'Categoría Sin categoría',
    )
    expect(within(protectedCategory).getByText('Protegida')).toBeInTheDocument()
    expect(
      within(protectedCategory).getByText(/Lunumia protege esta categoría/),
    ).toBeInTheDocument()
    expect(within(protectedCategory).queryByRole('button')).toBeNull()
  })

  it('consulta el uso y confirma la reasignación antes de eliminar', async () => {
    const user = userEvent.setup()
    const { services } = renderCategories()
    vi.mocked(
      services.categories.countCategoryExpenses.execute,
    ).mockResolvedValue(2)
    const personal = await screen.findByLabelText('Categoría Comida')
    await user.click(within(personal).getByRole('button', { name: 'Eliminar' }))
    expect(
      await screen.findByText(/2 gastos usan “Comida”/),
    ).toBeInTheDocument()
    expect(services.categories.deleteCategory.execute).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Eliminar categoría' }))
    await waitFor(() =>
      expect(services.categories.deleteCategory.execute).toHaveBeenCalled(),
    )
  })
})
