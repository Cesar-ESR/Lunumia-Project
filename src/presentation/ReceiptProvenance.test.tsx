import { render, screen, within } from '@testing-library/react'
import { App } from './App'
import {
  createApplicationServicesMock,
  createExpenseMock,
} from './test/test-factories'

describe.each(['/movimientos', '/inicio'])(
  'receipt provenance at %s',
  (path) => {
    it('shows Recibo only for explicit receipt provenance, alongside Gasto', async () => {
      const { services } = createApplicationServicesMock()
      vi.mocked(services.incomes.listIncomesByPeriod.execute).mockResolvedValue(
        [],
      )
      vi.mocked(
        services.expenses.listExpensesByPeriod.execute,
      ).mockResolvedValue([
        createExpenseMock({
          id: 'receipt',
          description: 'Receipt expense',
          source: 'receipt',
        }),
        createExpenseMock({
          id: 'manual',
          description: 'Manual expense',
          source: 'manual',
        }),
        createExpenseMock({
          id: 'legacy-null',
          description: 'Legacy null',
          source: null,
        }),
        createExpenseMock({
          id: 'legacy-missing',
          description: 'Legacy missing',
        }),
      ])
      window.history.replaceState({}, '', path)
      render(<App services={services} authServices={null} />)
      const receipt = (
        await screen.findByRole('heading', { name: 'Receipt expense' })
      ).closest('article')!
      expect(within(receipt).getByText('Gasto')).toBeVisible()
      expect(
        within(receipt).getByLabelText('Registrado desde recibo'),
      ).toHaveTextContent('Recibo')
      for (const name of ['Manual expense', 'Legacy null', 'Legacy missing']) {
        const row = (await screen.findByRole('heading', { name })).closest(
          'article',
        )!
        expect(within(row).getByText('Gasto')).toBeVisible()
        expect(within(row).queryByText('Recibo')).not.toBeInTheDocument()
      }
    })
  },
)
