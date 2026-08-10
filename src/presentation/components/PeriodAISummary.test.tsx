import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PeriodAISummary } from './PeriodAISummary'

const idle = { status: 'idle', summary: null, message: null } as const

describe('PeriodAISummary', () => {
  it('82-83, 88. tiene encabezado e identifica texto y highlights como lista', () => {
    render(
      <PeriodAISummary
        state={{
          status: 'success',
          message: null,
          summary: { text: 'Resumen generado', highlights: ['Uno', 'Dos'] },
        }}
        canUseAI
        hasData
        onGenerate={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Resumen inteligente' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Texto generado')).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('84-85. anuncia errores y Reintentar es accesible', async () => {
    const retry = vi.fn()
    render(
      <PeriodAISummary
        state={{ status: 'error', summary: null, message: 'No disponible.' }}
        canUseAI
        hasData
        onGenerate={retry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('No disponible.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('31, 87. loading y fallback no ocultan contenido previo', () => {
    render(
      <PeriodAISummary
        state={{
          status: 'loading',
          message: null,
          summary: { text: 'Resumen anterior', highlights: [] },
        }}
        canUseAI
        hasData
        onGenerate={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'cifras permanecen visibles',
    )
    expect(screen.getByText('Resumen anterior')).toBeInTheDocument()
  })

  it('24, 25. muestra estados vacíos y guest sin invocar acción', () => {
    const generate = vi.fn()
    const { rerender } = render(
      <PeriodAISummary
        state={idle}
        canUseAI={false}
        hasData
        onGenerate={generate}
      />,
    )
    expect(screen.getByText(/iniciar sesión/)).toBeInTheDocument()
    rerender(
      <PeriodAISummary
        state={idle}
        canUseAI
        hasData={false}
        onGenerate={generate}
      />,
    )
    expect(screen.getByText(/Registra movimientos/)).toBeInTheDocument()
    expect(generate).not.toHaveBeenCalled()
  })
})
