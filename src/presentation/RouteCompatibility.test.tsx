import { render, screen } from '@testing-library/react'
import { App } from './App'
import { createApplicationServicesMock } from './test/test-factories'

describe('compatibilidad de rutas U3', () => {
  it.each([
    ['/dashboard', 'Tu panorama financiero'],
    ['/incomes', 'Movimientos'],
    ['/movimientos/ingresos/nuevo', 'Registrar ingreso'],
    ['/expenses', 'Gastos'],
    ['/expenses/receipt', 'Escanear recibo'],
    ['/recurring', 'Compromisos'],
    ['/budgets', 'Presupuestos'],
    ['/plan/presupuestos', 'Presupuestos'],
    ['/plan/proyeccion', 'Proyección'],
    ['/periods', 'Periodos'],
    ['/plan/periodos', 'Periodos'],
    ['/categories', 'Categorías'],
    ['/organizacion/categorias', 'Categorías'],
    ['/insights', 'Análisis'],
    ['/simulator', 'Simulador de compra'],
    ['/simulador', 'Simulador de compra'],
    ['/settings', 'Configuración'],
  ])('mantiene accesible %s', async (path, heading) => {
    window.history.replaceState({}, '', path)
    const { services } = createApplicationServicesMock()
    render(<App services={services} authServices={null} />)
    expect(
      await screen.findByRole('heading', { name: heading }),
    ).toBeInTheDocument()
  })
})
