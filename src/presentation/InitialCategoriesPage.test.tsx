import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { STARTER_CATEGORY_TEMPLATES } from '@application/use-cases/categories/starter-category-templates'
import type { Category } from '@domain/entities'
import { normalizeCategoryName } from '@domain/rules'
import { App } from './App'
import {
  createApplicationServicesMock,
  createCategoryMock,
} from './test/test-factories'
import { requestDirtyNavigation } from './utils/dirty-navigation'

function systemCategory(): Category {
  return createCategoryMock({
    id: 'system-category',
    name: 'Sin categoría',
    normalizedName: 'sin categoría',
    color: '#64748B',
    icon: 'inbox',
    isSystem: true,
  })
}

function starterCategories(): Category[] {
  return STARTER_CATEGORY_TEMPLATES.map((template, index) =>
    createCategoryMock({
      id: `starter-category-${index}`,
      ...template,
      normalizedName: normalizeCategoryName(template.name),
    }),
  )
}

function renderCategories(categories: Category[] = starterCategories()) {
  window.history.replaceState(
    { usr: { from: '/inicio' }, key: 'category-setup', idx: 0 },
    '',
    '/configuracion-inicial/categorias',
  )
  const result = createApplicationServicesMock({
    categories: [systemCategory(), ...categories],
  })
  const view = render(<App services={result.services} authServices={null} />)
  return { ...result, ...view }
}

async function categoryList() {
  return screen.findByRole('list', {
    name: 'Categorías para organizar tus gastos',
  })
}

describe('configuración inicial de categorías', () => {
  it('muestra Paso 3 de 4, los nueve starters persistidos en orden canónico y oculta el sistema', async () => {
    const { services } = renderCategories()
    expect(
      await screen.findByRole('heading', { name: 'Organiza tus gastos' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument()

    const list = await categoryList()
    const labels = within(list)
      .getAllByRole('checkbox')
      .map((checkbox) => checkbox.parentElement?.textContent)
    expect(labels).toEqual(
      STARTER_CATEGORY_TEMPLATES.map((template) => template.name),
    )
    expect(screen.queryByText('Sin categoría')).toBeNull()
    expect(screen.queryByText('inbox')).toBeNull()
    expect(services.categories.listCategories.execute).toHaveBeenCalled()
    expect(services.categories.createCategory.execute).not.toHaveBeenCalled()
  })

  it('continúa sin mutaciones cuando el borrador no cambió', async () => {
    const user = userEvent.setup()
    const { services } = renderCategories()
    await categoryList()

    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(
      await screen.findByRole('heading', {
        name: '¿Quieres indicar tu saldo actual?',
      }),
    ).toBeInTheDocument()
    expect(services.categories.createCategory.execute).not.toHaveBeenCalled()
    expect(services.categories.updateCategory.execute).not.toHaveBeenCalled()
    expect(services.categories.deleteCategory.execute).not.toHaveBeenCalled()
  })

  it('elimina por ID una categoría ordinaria desmarcada', async () => {
    const user = userEvent.setup()
    const values = starterCategories()
    const education = values.find(({ name }) => name === 'Educación')!
    const { services } = renderCategories(values)
    await categoryList()

    await user.click(screen.getByRole('checkbox', { name: 'Educación' }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() =>
      expect(services.categories.deleteCategory.execute).toHaveBeenCalledWith(
        education.id,
      ),
    )
    expect(services.categories.deleteCategory.execute).toHaveBeenCalledTimes(1)
    expect(services.categories.updateCategory.execute).not.toHaveBeenCalled()
    expect(services.categories.createCategory.execute).not.toHaveBeenCalled()
  })

  it('renombra la fila persistida mediante updateCategory y conserva sus metadatos visuales', async () => {
    const user = userEvent.setup()
    const values = starterCategories()
    const food = values[0]!
    const { services } = renderCategories(values)
    const list = await categoryList()
    const row = within(list)
      .getByRole('checkbox', {
        name: 'Alimentación',
      })
      .closest('li')!

    await user.click(within(row).getByRole('button', { name: 'Editar' }))
    const input = screen.getByRole('textbox', {
      name: 'Nombre de Alimentación',
    })
    expect(input).toHaveFocus()
    await user.clear(input)
    await user.type(input, 'Comida')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() =>
      expect(services.categories.updateCategory.execute).toHaveBeenCalledWith(
        food.id,
        {
          ownerId: services.ownerId,
          name: 'Comida',
          color: food.color,
          icon: food.icon,
        },
      ),
    )
    expect(services.categories.createCategory.execute).not.toHaveBeenCalled()
  })

  it('crea una categoría personalizada con los defaults existentes', async () => {
    const user = userEvent.setup()
    const { services } = renderCategories()
    await categoryList()

    await user.click(screen.getByRole('button', { name: 'Agregar categoría' }))
    const input = screen.getByRole('textbox', {
      name: 'Nombre de Nueva categoría',
    })
    expect(input).toHaveFocus()
    await user.type(input, 'Mascotas')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() =>
      expect(services.categories.createCategory.execute).toHaveBeenCalledWith({
        ownerId: services.ownerId,
        name: 'Mascotas',
        color: STARTER_CATEGORY_TEMPLATES[0]!.color,
        icon: null,
      }),
    )
    expect(services.categories.updateCategory.execute).not.toHaveBeenCalled()
  })

  it('rechaza un nombre equivalente antes de producir una categoría activa duplicada', async () => {
    const user = userEvent.setup()
    const { services } = renderCategories()
    await categoryList()

    await user.click(screen.getByRole('button', { name: 'Agregar categoría' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Nombre de Nueva categoría' }),
      'ALIMENTACIÓN',
    )
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(
      screen.getAllByText('Ya existe una categoría con ese nombre.'),
    ).toHaveLength(1)
    expect(window.location.pathname).toBe('/configuracion-inicial/categorias')
    expect(services.categories.createCategory.execute).not.toHaveBeenCalled()
  })

  it('no avanza y recarga el estado persistido si una aplicación parcial falla', async () => {
    const user = userEvent.setup()
    const values = starterCategories()
    const { services } = renderCategories(values)
    await categoryList()
    vi.mocked(services.categories.deleteCategory.execute)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('No se pudo completar el lote.'))

    await user.click(screen.getByRole('checkbox', { name: 'Educación' }))
    await user.click(screen.getByRole('checkbox', { name: 'Otros' }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(
      await screen.findByText(/Recargamos tus categorías/),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/configuracion-inicial/categorias')
    expect(services.categories.listCategories.execute).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('checkbox', { name: 'Educación' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Otros' })).toBeChecked()
  })

  it('permite quitar todas las categorías ordinarias sin tocar la protegida', async () => {
    const user = userEvent.setup()
    const values = starterCategories()
    const { services } = renderCategories(values)
    const list = await categoryList()

    for (const checkbox of within(list).getAllByRole('checkbox'))
      await user.click(checkbox)
    expect(
      screen.getByText('Podrás crear categorías después desde Organización.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() =>
      expect(services.categories.deleteCategory.execute).toHaveBeenCalledTimes(
        values.length,
      ),
    )
    expect(services.categories.deleteCategory.execute).not.toHaveBeenCalledWith(
      'system-category',
    )
    expect(
      await screen.findByRole('heading', {
        name: '¿Quieres indicar tu saldo actual?',
      }),
    ).toBeInTheDocument()
  })

  it('preserva categorías personalizadas existentes y las ordena después de starters conocidos', async () => {
    const custom = ['Viajes', 'Comida', 'Mascotas'].map((name, index) =>
      createCategoryMock({
        id: `custom-${index}`,
        name,
        normalizedName: normalizeCategoryName(name),
      }),
    )
    renderCategories([starterCategories()[1]!, ...custom])

    const list = await categoryList()
    const labels = within(list)
      .getAllByRole('checkbox')
      .map((checkbox) => checkbox.parentElement?.textContent)
    expect(labels).toEqual(['Transporte', 'Comida', 'Mascotas', 'Viajes'])
  })

  it('protege un borrador modificado con el guard existente', async () => {
    const user = userEvent.setup()
    renderCategories()
    await categoryList()
    await user.click(screen.getByRole('checkbox', { name: 'Educación' }))
    const leave = vi.fn()

    act(() => expect(requestDirtyNavigation(leave)).toBe(true))
    expect(
      screen.getByRole('dialog', { name: '¿Salir sin guardar?' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(leave).not.toHaveBeenCalled()
  })

  it('permite refrescar directamente el paso cuando ya existe periodo', async () => {
    renderCategories()
    expect(
      await screen.findByRole('heading', { name: 'Organiza tus gastos' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/configuracion-inicial/categorias')
  })

  it('vuelve al flujo requerido si se abre el paso sin periodo activo', async () => {
    window.history.replaceState({}, '', '/configuracion-inicial/categorias')
    const { services } = createApplicationServicesMock({ activePeriod: null })
    render(<App services={services} authServices={null} />)

    expect(
      await screen.findByRole('heading', {
        name: 'Entiende tu dinero con más claridad',
      }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/configuracion-inicial')
    expect(services.categories.listCategories.execute).not.toHaveBeenCalled()
  })
})
