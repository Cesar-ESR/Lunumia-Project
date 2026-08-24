import { act, render, screen, waitFor } from '@testing-library/react'
import { lazy } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { RouteFocus } from './RouteFocus'
import { RouteLoadingBoundary } from './RouteLoadingBoundary'

describe('RouteLoadingBoundary', () => {
  it('announces route loading and focuses the heading after the lazy page resolves', async () => {
    let resolvePage!: (module: { default: () => React.JSX.Element }) => void
    const DeferredPage = lazy(
      () =>
        new Promise<{ default: () => React.JSX.Element }>((resolve) => {
          resolvePage = resolve
        }),
    )

    render(
      <MemoryRouter initialEntries={['/insights']}>
        <main id="main-content">
          <RouteFocus />
          <RouteLoadingBoundary>
            <DeferredPage />
          </RouteLoadingBoundary>
        </main>
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando sección…')
    expect(document.activeElement).toBe(document.body)

    await act(async () => {
      resolvePage({ default: () => <h1>Análisis diferido</h1> })
    })

    const heading = await screen.findByRole('heading', {
      name: 'Análisis diferido',
    })
    await waitFor(() => expect(document.activeElement).toBe(heading))
  })
})
