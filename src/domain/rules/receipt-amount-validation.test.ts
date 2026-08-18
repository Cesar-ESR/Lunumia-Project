import { describe, expect, it } from 'vitest'
import {
  validateReceiptAmount,
  type ReceiptAmountProposal,
} from './receipt-amount-validation'

const proposal: ReceiptAmountProposal = {
  subtotal: 10_000,
  tax: 1_600,
  tip: null,
  discount: null,
  otherFees: null,
  total: 11_600,
  amountPaid: 11_600,
  amountEvidence: 'TOTAL $116.00',
  amountAmbiguous: false,
  currency: 'MXN',
  confidence: 0.9,
}

describe('validateReceiptAmount', () => {
  it('acepta un total coherente sin alterar la propuesta', () => {
    const before = structuredClone(proposal)
    expect(validateReceiptAmount(proposal, ['MXN'])).toEqual({
      status: 'valid',
      reasons: [],
      totalCents: 11_600,
    })
    expect(proposal).toEqual(before)
  })

  it.each([
    [null, 'total_missing'],
    [0, 'total_non_positive'],
    [-18_990, 'total_non_positive'],
    [189.9, 'total_not_integer_cents'],
    [Number.MAX_SAFE_INTEGER + 1, 'total_unsafe'],
  ] as const)('clasifica total %s como invalid', (total, reason) => {
    expect(validateReceiptAmount({ ...proposal, total })).toMatchObject({
      status: 'invalid',
      reasons: [reason],
      totalCents: total,
    })
  })

  it('marca mismatch sin corregir el total', () => {
    expect(validateReceiptAmount({ ...proposal, total: 15_000 })).toMatchObject(
      {
        status: 'needs_review',
        reasons: expect.arrayContaining(['subtotal_tax_total_mismatch']),
        totalCents: 15_000,
      },
    )
  })

  it('incluye propina, descuento y cargos conocidos en el cross-check', () => {
    expect(
      validateReceiptAmount({
        ...proposal,
        tip: 1_000,
        discount: 200,
        otherFees: 100,
        total: 12_500,
        amountPaid: 12_500,
      }).reasons,
    ).not.toContain('subtotal_tax_total_mismatch')
  })

  it.each([
    [{ currency: null }, 'currency_missing'],
    [{ currency: 'USD' }, 'currency_unsupported'],
    [{ amountEvidence: null }, 'evidence_missing'],
    [{ confidence: 0.2 }, 'confidence_low'],
    [{ amountAmbiguous: true }, 'amount_ambiguous'],
    [{ amountPaid: 20_000 }, 'amount_paid_mismatch'],
  ] as const)('marca revisión por %s', (override, reason) => {
    expect(
      validateReceiptAmount({ ...proposal, ...override }, ['MXN']),
    ).toMatchObject({
      status: 'needs_review',
      reasons: expect.arrayContaining([reason]),
    })
  })
})
