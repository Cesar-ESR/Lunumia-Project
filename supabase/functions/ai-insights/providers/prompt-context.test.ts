import {
  buildExplainChangesPromptContext,
  buildPlanningPromptContext,
  buildPeriodSummaryPromptContext,
  formatCurrency,
} from './prompt-context.ts'

const categoryId = '11111111-1111-4111-8111-111111111111'

describe('contexto monetario para Groq', () => {
  it.each([
    [700_000, '$7,000.00'],
    [21_300, '$213.00'],
    [14_000, '$140.00'],
    [7_300, '$73.00'],
    [12_000, '$120.00'],
    [5_000, '$50.00'],
    [2_300, '$23.00'],
    [2_000, '$20.00'],
  ])('formatea %i centavos como %s', (amount, expected) => {
    expect(formatCurrency(amount)).toBe(expected)
  })

  it('prepara period-summary sin AmountCents raw', () => {
    const context = buildPeriodSummaryPromptContext({
      context: 'historical',
      facts: {
        receivedIncomeCents: 700_000,
        expenseCents: 21_300,
        categoryBreakdown: [
          {
            categoryId,
            categoryName: 'Comida',
            totalCents: 14_000,
            percentage: 65.73,
          },
        ],
        topExpenses: [{ description: 'Hamburguesa', amountCents: 12_000 }],
        periodType: 'monthly',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      },
    })

    expect(context).toEqual({
      context: 'historical',
      receivedIncome: '$7,000.00',
      expenses: '$213.00',
      categoryBreakdown: [
        {
          categoryName: 'Comida',
          total: '$140.00',
          percentage: '65.73%',
        },
      ],
      topExpenses: [{ description: 'Hamburguesa', amount: '$120.00' }],
      periodType: 'monthly',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    expect(JSON.stringify(context)).not.toMatch(/700000|21300|14000|12000/)
  })

  it('prepara planificación en integer cents sin recalcular y conserva null y negativos', () => {
    const context = buildPlanningPromptContext({
      context: 'planning',
      facts: {
        currentBalanceCents: null,
        committedCents: 25_00,
        expectedIncomeCents: 30_00,
        projectedAvailableCents: -35_00,
        projectedClosingBalanceCents: -5_00,
        projectionCoverage: 'overdue_only',
        projectionHorizonEnd: null,
      },
    })

    expect(context).toEqual({
      context: 'planning',
      facts: {
        currentBalanceCents: null,
        committedCents: 25_00,
        expectedIncomeCents: 30_00,
        projectedAvailableCents: -35_00,
        projectedClosingBalanceCents: -5_00,
        projectionCoverage: 'overdue_only',
        projectionHorizonEnd: null,
      },
    })
  })

  it('prepara explain-changes después del cálculo TypeScript', () => {
    const context = buildExplainChangesPromptContext({
      changes: [
        {
          categoryId,
          categoryName: 'Comida',
          currentAmount: 4_000,
          previousAmount: 2_000,
          changePercentage: 100,
          absoluteChange: 2_000,
        },
      ],
    })

    expect(context).toEqual({
      changes: [
        {
          categoryId,
          categoryName: 'Comida',
          currentAmount: '$40.00',
          previousAmount: '$20.00',
          changePercentage: '+100.00%',
          absoluteChange: '$20.00',
        },
      ],
    })
  })
})
