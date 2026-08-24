import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { EmptyState } from './EmptyState'
import { FormField } from './FormField'
import { LoadingState } from './LoadingState'
import { MoneyField } from './MoneyField'
import { Notice } from './Notice'
import { QuickActionButton } from './QuickActionButton'

describe('UX foundation primitives', () => {
  it('mantiene semántica nativa y estado loading en Button', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Guardar</Button>)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onClick).toHaveBeenCalledOnce()

    rerender(
      <Button loading loadingLabel="Guardando…" onClick={onClick}>
        Guardar
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Guardando…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('asocia label, ayuda, error y estado inválido en FormField', () => {
    render(
      <FormField
        id="amount"
        label="Monto"
        hint="Máximo dos decimales"
        error="Escribe un monto válido"
        required
      >
        <input id="amount" />
      </FormField>,
    )
    const input = screen.getByLabelText(/Monto/)
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(
      'Máximo dos decimales Escribe un monto válido',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe un monto válido',
    )
  })

  it('expone moneda e input decimal sin alterar el parser financiero', () => {
    render(
      <MoneyField
        id="money"
        label="Saldo actual"
        value="125.50"
        onChange={() => undefined}
        hint="Puedes escribir pesos y centavos"
      />,
    )
    const input = screen.getByRole('textbox', {
      name: 'Saldo actual en pesos mexicanos',
    })
    expect(input).toHaveAttribute('inputmode', 'decimal')
    expect(input).toHaveValue('125.50')
    expect(screen.getByText('$')).toBeInTheDocument()
    expect(screen.getByText('MXN')).toBeInTheDocument()
  })

  it('aplica roles de feedback sin convertir todos los avisos en alertas', () => {
    render(
      <>
        <Notice
          tone="warning"
          title="Cobertura limitada"
          message="Revisa el periodo."
        />
        <Notice tone="error" message="No se pudo guardar." />
        <LoadingState message="Calculando…" />
        <EmptyState
          title="Sin movimientos"
          description="Registra el primero."
        />
      </>,
    )
    expect(
      screen.getByText('Cobertura limitada').closest('[role="status"]'),
    ).toHaveTextContent('Revisa el periodo.')
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar')
    expect(screen.getByText('Calculando…').parentElement).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(
      screen.getByRole('heading', { name: 'Sin movimientos' }),
    ).toBeInTheDocument()
  })

  it('expone la acción rápida futura como button, no como destino de navegación', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<QuickActionButton onClick={onClick} />)
    const action = screen.getByRole('button', { name: 'Registrar' })
    expect(action).not.toHaveAttribute('href')
    await user.click(action)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
