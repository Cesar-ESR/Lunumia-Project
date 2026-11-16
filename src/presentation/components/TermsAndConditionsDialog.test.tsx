import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TermsAndConditionsDialog } from './TermsAndConditionsDialog'

describe('TermsAndConditionsDialog', () => {
  it('no muestra el diálogo cuando open es falso', () => {
    render(<TermsAndConditionsDialog open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('muestra el contenido completo de los términos y condiciones cuando open es verdadero', () => {
    render(<TermsAndConditionsDialog open={true} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(
      screen.getByText('Términos y Condiciones de Uso'),
    ).toBeInTheDocument()
    expect(screen.getByText(/16 de noviembre de 2026/)).toBeInTheDocument()
    expect(
      screen.getByText(/César Emmanuel Santiago Rodríguez/),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/legal@lunumia.com/).length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByText(/1\. Objeto y Descripción del Servicio/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/10\. Legislación Aplicable y Jurisdicción/),
    ).toBeInTheDocument()
  })

  it('invoca onClose al hacer clic en el botón de cerrar', async () => {
    const handleClose = vi.fn()
    const user = userEvent.setup()
    render(<TermsAndConditionsDialog open={true} onClose={handleClose} />)

    const closeButton = screen.getByRole('button', { name: /Cerrar/i })
    await user.click(closeButton)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
