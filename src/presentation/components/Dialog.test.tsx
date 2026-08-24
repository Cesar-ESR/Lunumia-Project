import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { Dialog } from './Dialog'

function DialogHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir diálogo
      </button>
      <Dialog
        open={open}
        title="Revisar operación"
        description="Comprueba los datos antes de continuar."
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => undefined}>Continuar</Button>
          </>
        }
      />
    </>
  )
}

describe('Dialog', () => {
  it('expone nombre, descripción, modalidad y foco inicial seguro', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir diálogo' }))

    const dialog = screen.getByRole('dialog', { name: 'Revisar operación' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(
      'Comprueba los datos antes de continuar.',
    )
    expect(
      screen.getByRole('heading', { name: 'Revisar operación' }),
    ).toHaveFocus()
  })

  it('mantiene Tab y Shift+Tab dentro del diálogo', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir diálogo' }))
    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    const continueButton = screen.getByRole('button', { name: 'Continuar' })

    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab()
    expect(continueButton).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab({ shift: true })
    expect(continueButton).toHaveFocus()
  })

  it('cierra con Escape y restaura el foco al trigger', async () => {
    const user = userEvent.setup()
    const { container } = render(<DialogHarness />)
    const trigger = screen.getByRole('button', { name: 'Abrir diálogo' })
    await user.click(trigger)
    expect(document.body.style.overflow).toBe('hidden')
    expect(container).toHaveAttribute('inert')
    expect(container).toHaveAttribute('aria-hidden', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
    expect(container).not.toHaveAttribute('inert')
    expect(container).not.toHaveAttribute('aria-hidden')
  })

  it('cierra con Android Back antes de permitir navegación de ruta', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir diálogo' }))
    const target = document.querySelector<HTMLElement>(
      '[data-native-back-target]',
    )
    expect(target).not.toBeNull()
    act(() => target?.dispatchEvent(new Event('lunumia:native-back')))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir diálogo' })).toHaveFocus()
  })

  it('ConfirmDialog no enfoca la acción destructiva y bloquea Escape pendiente', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const { rerender } = render(
      <ConfirmDialog
        open
        title="Eliminar registro"
        description="Esta acción elimina el registro."
        confirmLabel="Eliminar"
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Eliminar' })).not.toHaveFocus()

    rerender(
      <ConfirmDialog
        open
        title="Eliminar registro"
        description="Esta acción elimina el registro."
        confirmLabel="Eliminar"
        isPending
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    )
    await user.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
