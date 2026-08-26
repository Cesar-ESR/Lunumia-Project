import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../App'
import {
  CATEGORY_ID,
  createApplicationServicesMock,
} from '../../test/test-factories'

const APP_READY_TIMEOUT_MS = 3_000

describe('ReceiptCapturePage routing', () => {
  it('expone Escanear recibo desde Gastos y abre la ruta dedicada', async () => {
    const { services } = createApplicationServicesMock()
    window.history.replaceState({}, '', '/expenses')
    render(<App services={services} authServices={null} />)
    const link = await screen.findByRole(
      'link',
      { name: 'Escanear recibo' },
      { timeout: APP_READY_TIMEOUT_MS },
    )
    expect(link).toHaveAttribute('href', '/expenses/receipt')
    act(() => {
      window.history.pushState({}, '', '/expenses/receipt')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(
      await screen.findByRole('heading', { name: 'Escanear recibo' }),
    ).toBeVisible()
    expect(
      await screen.findByRole('button', { name: 'Registrar manualmente' }),
    ).toBeEnabled()
  })

  it('crea localmente desde captura manual y navega a Gastos con éxito', async () => {
    const user = userEvent.setup()
    const { services, mocks } = createApplicationServicesMock()
    window.history.replaceState({}, '', '/expenses/receipt')
    render(<App services={services} authServices={null} />)
    await user.click(
      await screen.findByRole('button', { name: 'Registrar manualmente' }),
    )
    await user.type(screen.getByLabelText('Monto (MXN)'), '25.50')
    await user.type(screen.getByLabelText('Descripción'), 'Gasto manual')
    await user.clear(screen.getByLabelText('Fecha'))
    await user.type(screen.getByLabelText('Fecha'), '2026-07-15')
    await user.selectOptions(screen.getByLabelText('Categoría'), CATEGORY_ID)
    await user.click(
      screen.getByRole('button', {
        name: 'Confirmar monto y guardar gasto',
      }),
    )
    expect(mocks.createExpense).toHaveBeenCalledOnce()
    await waitFor(() => expect(window.location.pathname).toBe('/expenses'))
  })
})
