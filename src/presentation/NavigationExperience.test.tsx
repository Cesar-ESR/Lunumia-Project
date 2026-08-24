import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { createApplicationServicesMock } from './test/test-factories'

function renderPath(path: string) {
  window.history.replaceState({}, '', path)
  const result = createApplicationServicesMock()
  const view = render(<App services={result.services} authServices={null} />)
  return { ...result, view }
}

describe('navegación UX 2.0', () => {
  it.each([
    ['/inicio', 'Tu panorama financiero'],
    ['/movimientos', 'Movimientos'],
    ['/plan', 'Planificación'],
    ['/mas', 'Más'],
  ])('renderiza el destino canónico %s', async (path, heading) => {
    renderPath(path)
    expect(
      await screen.findByRole('heading', { name: heading }),
    ).toBeInTheDocument()
  })

  it('expone los cuatro destinos persistentes móviles con icono y etiqueta', async () => {
    renderPath('/movimientos')
    await screen.findByRole('heading', { name: 'Movimientos' })
    const navigation = screen.getByRole('navigation', {
      name: 'Accesos principales',
    })
    const links = within(navigation).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Inicio',
      'Movimientos',
      'Plan',
      'Más',
    ])
    expect(
      within(navigation).getByRole('link', { name: 'Movimientos' }),
    ).toHaveAttribute('aria-current', 'page')
    for (const link of links)
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it.each([
    ['/expenses', 'Movimientos'],
    ['/incomes', 'Movimientos'],
    ['/expenses/receipt', 'Movimientos'],
    ['/recurring', 'Plan'],
    ['/plan/compromisos', 'Plan'],
    ['/plan/compromisos/occurrence-1', 'Plan'],
    ['/budgets', 'Plan'],
    ['/plan/presupuestos', 'Plan'],
    ['/plan/proyeccion', 'Plan'],
    ['/periods', 'Plan'],
    ['/plan/periodos', 'Plan'],
    ['/insights', 'Más'],
    ['/simulator', 'Más'],
    ['/simulador', 'Más'],
    ['/categories', 'Más'],
    ['/organizacion/categorias', 'Más'],
    ['/settings', 'Más'],
  ])('mantiene %s dentro del grupo móvil %s', async (path, activeLabel) => {
    renderPath(path)
    const navigation = await screen.findByRole('navigation', {
      name: 'Accesos principales',
    })
    expect(
      within(navigation).getByRole('link', { name: activeLabel }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('simplifica la navegación principal de escritorio a tres áreas reales', async () => {
    renderPath('/plan')
    await screen.findByRole('heading', { name: 'Planificación' })
    const sidebar = screen.getByRole('complementary', {
      name: 'Navegación lateral',
    })
    const primary = within(sidebar).getByRole('navigation', {
      name: 'Navegación principal',
    })
    expect(
      within(primary).getByRole('link', { name: 'Inicio' }),
    ).toHaveAttribute('href', '/inicio')
    expect(
      within(primary).getByRole('link', { name: 'Movimientos' }),
    ).toHaveAttribute('href', '/movimientos')
    expect(
      within(primary).getByRole('link', { name: 'Planificación' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(within(primary).queryByRole('link', { name: 'Gastos' })).toBeNull()
    expect(within(primary).queryByRole('link', { name: 'Ingresos' })).toBeNull()
  })

  it('agrupa Más únicamente con destinos existentes', async () => {
    renderPath('/mas')
    await screen.findByRole('heading', { name: 'Más' })
    for (const group of [
      'Entender',
      'Organizar',
      'Tus datos',
      'Cuenta y aplicación',
    ])
      expect(screen.getByRole('heading', { name: group })).toBeInTheDocument()
    for (const destination of [
      'Abrir Análisis',
      'Abrir Simulador',
      'Abrir Periodos',
      'Abrir Categorías',
      'Abrir Datos y respaldos',
      'Abrir Configuración',
    ])
      expect(
        screen.getByRole('link', { name: destination }),
      ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Abrir Simulador' }),
    ).toHaveAttribute('href', '/simulador')
    expect(
      screen.getByRole('link', { name: 'Abrir Periodos' }),
    ).toHaveAttribute('href', '/plan/periodos')
    expect(
      screen.getByRole('link', { name: 'Abrir Categorías' }),
    ).toHaveAttribute('href', '/organizacion/categorias')
  })

  it.each([
    ['/simulator', '/simulador'],
    ['/periods', '/plan/periodos'],
    ['/categories', '/organizacion/categorias'],
  ])('redirige %s hacia su destino canónico %s', async (legacy, canonical) => {
    renderPath(legacy)
    await waitFor(() => expect(window.location.pathname).toBe(canonical))
  })

  it('abre Registrar con los tres flujos reales y lo oculta en formularios', async () => {
    const user = userEvent.setup()
    const { view } = renderPath('/movimientos')
    await screen.findByRole('heading', { name: 'Movimientos' })
    await user.click(screen.getByRole('button', { name: 'Registrar' }))
    const dialog = screen.getByRole('dialog', { name: 'Registrar' })
    expect(within(dialog).getByRole('link', { name: /Gasto/ })).toHaveAttribute(
      'href',
      '/expenses',
    )
    expect(
      within(dialog).getByRole('link', { name: /Ingreso/ }),
    ).toHaveAttribute('href', '/movimientos/ingresos/nuevo')
    expect(
      within(dialog).getByRole('link', { name: /Escanear recibo/ }),
    ).toHaveAttribute('href', '/expenses/receipt')

    view.unmount()
    renderPath('/expenses')
    await screen.findByRole('heading', { name: 'Gastos' })
    expect(screen.queryByRole('button', { name: 'Registrar' })).toBeNull()
  })

  it('Android Back cierra Registrar antes de cambiar la ruta', async () => {
    const user = userEvent.setup()
    const { services } = renderPath('/movimientos')
    await screen.findByRole('heading', { name: 'Movimientos' })
    await user.click(screen.getByRole('button', { name: 'Registrar' }))
    expect(screen.getByRole('dialog', { name: 'Registrar' })).toBeVisible()
    await waitFor(() =>
      expect(services.backButton.subscribe).toHaveBeenCalled(),
    )
    const listener = vi.mocked(services.backButton.subscribe).mock.calls[0]?.[0]
    act(() => listener?.({ canGoBack: true }))
    expect(screen.queryByRole('dialog', { name: 'Registrar' })).toBeNull()
    expect(window.location.pathname).toBe('/movimientos')
  })

  it('un ingreso modificado exige confirmación antes de salir', async () => {
    const user = userEvent.setup()
    renderPath('/movimientos/ingresos/nuevo')
    await screen.findByRole('heading', { name: 'Registrar ingreso' })
    const amount = screen.getByRole('textbox', { name: /Monto/ })
    await user.type(amount, '250')
    expect(amount).toHaveValue('250')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(
      screen.getByRole('dialog', { name: '¿Salir sin guardar?' }),
    ).toBeVisible()
    expect(window.location.pathname).toBe('/movimientos/ingresos/nuevo')
    await user.click(screen.getByRole('button', { name: 'Salir' }))
    await waitFor(() => expect(window.location.pathname).toBe('/movimientos'))
  })

  it('redirige la ruta legacy Dashboard sin ciclo y enfoca el h1 nuevo', async () => {
    renderPath('/dashboard')
    const heading = await screen.findByRole('heading', {
      name: 'Tu panorama financiero',
    })
    await waitFor(() => expect(window.location.pathname).toBe('/inicio'))
    await waitFor(() => expect(document.activeElement).toBe(heading))
  })
})
