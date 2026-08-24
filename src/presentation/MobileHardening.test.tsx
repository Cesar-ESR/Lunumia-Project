import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard'
import { useVirtualKeyboard } from './hooks/useVirtualKeyboard'

function DirtyHarness({ onLeave }: { onLeave(): void }) {
  const [value, setValue] = useState('')
  const { requestLeave, guardDialog } = useUnsavedChangesGuard({
    dirty: value.length > 0,
  })
  return (
    <>
      <label>
        Nombre
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => requestLeave(onLeave)}>
        Salir
      </button>
      {guardDialog}
    </>
  )
}

function KeyboardHarness() {
  const keyboard = useVirtualKeyboard()
  return (
    <>
      <label>
        Monto
        <input />
      </label>
      <output>
        {keyboard.open ? `abierto ${keyboard.offset}` : 'cerrado'}
      </output>
    </>
  )
}

describe('hardening móvil', () => {
  it('confirma antes de descartar cambios y restaura el foco al cancelar', async () => {
    const user = userEvent.setup()
    const onLeave = vi.fn()
    render(<DirtyHarness onLeave={onLeave} />)
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Renta')
    const leave = screen.getByRole('button', { name: 'Salir' })
    await user.click(leave)
    expect(
      screen.getByRole('dialog', { name: '¿Salir sin guardar?' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onLeave).not.toHaveBeenCalled()
    expect(leave).toHaveFocus()

    await user.click(leave)
    await user.click(screen.getByRole('button', { name: 'Salir' }))
    expect(onLeave).toHaveBeenCalledOnce()
  })

  it('detecta teclado por visualViewport sólo mientras un campo está enfocado', async () => {
    const originalViewport = Object.getOwnPropertyDescriptor(
      window,
      'visualViewport',
    )
    const viewport = new EventTarget() as EventTarget & { height: number }
    viewport.height = 800
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    })
    const user = userEvent.setup()
    render(<KeyboardHarness />)
    const input = screen.getByRole('textbox', { name: 'Monto' })
    await user.click(input)
    viewport.height = 540
    act(() => viewport.dispatchEvent(new Event('resize')))
    expect(screen.getByText('abierto 260')).toBeVisible()

    await user.tab()
    await act(async () => undefined)
    expect(screen.getByText('cerrado')).toBeVisible()
    if (originalViewport)
      Object.defineProperty(window, 'visualViewport', originalViewport)
    else delete (window as { visualViewport?: VisualViewport }).visualViewport
  })
})
