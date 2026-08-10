import type { Period } from '@domain/entities'
import {
  mapReceiptToExpenseDraft,
  resolveReceiptPeriodId,
} from './ReceiptFormMapper'

const julyPeriod: Period = {
  id: '11111111-1111-4111-8111-111111111111',
  ownerId: 'owner',
  type: 'monthly',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'pending',
}
const augustPeriod: Period = {
  ...julyPeriod,
  id: '22222222-2222-4222-8222-222222222222',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
}
const periods = [julyPeriod, augustPeriod]

describe('ReceiptFormMapper', () => {
  it('mapea centavos, DateOnly y el periodo que contiene la fecha', () => {
    const proposal = mapReceiptToExpenseDraft(
      {
        merchant: 'Mercado',
        date: '2026-08-04',
        total: 12345,
        currency: 'MXN',
        confidence: 0.9,
        rawText: 'texto descartado',
      },
      periods,
      julyPeriod.id,
    )
    expect(proposal.draft).toEqual({
      description: 'Mercado',
      amount: 12345,
      date: '2026-08-04',
      categoryId: '',
      periodId: augustPeriod.id,
    })
    expect(proposal).not.toHaveProperty('rawText')
  })

  it('no inventa campos faltantes y conserva el periodo activo sin fecha', () => {
    const proposal = mapReceiptToExpenseDraft(
      {
        merchant: null,
        date: null,
        total: null,
        currency: null,
        confidence: 0.3,
        rawText: 'contenido libre',
      },
      periods,
      julyPeriod.id,
    )
    expect(proposal.draft).toEqual({
      description: '',
      amount: null,
      date: '',
      categoryId: '',
      periodId: julyPeriod.id,
    })
  })

  it('prefiere el periodo activo cuando contiene la fecha', () => {
    expect(resolveReceiptPeriodId('2026-07-10', periods, julyPeriod.id)).toBe(
      julyPeriod.id,
    )
  })

  it('deja el periodo vacío cuando ninguna fecha es compatible', () => {
    expect(resolveReceiptPeriodId('2026-09-10', periods, julyPeriod.id)).toBe(
      '',
    )
  })
})
