import type { Period, UserSettings } from '@domain/entities'
import {
  buildPeriodOverlapPlan,
  planPeriodNavigation,
  validatePeriodResolutionChoices,
  type PeriodDependency,
} from './PeriodOverlapResolution'

const period = (id: string, startDate: string, endDate: string): Period => ({
  id,
  ownerId: 'owner',
  type: 'monthly',
  startDate,
  endDate,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'pending',
})
const legacy = period('legacy', '2026-07-31', '2026-08-31')
const july = period('july', '2026-07-01', '2026-07-31')
const august = period('august', '2026-08-01', '2026-08-31')
const dependency = (
  id: string,
  kind: PeriodDependency['kind'],
  date: string | null,
): PeriodDependency => ({
  id,
  kind,
  date,
  ownerId: 'owner',
  periodId: 'legacy',
  deletedAt: null,
  ...(kind === 'categoryBudget' ? { categoryId: 'category' } : {}),
})
const settings: UserSettings = {
  id: 'settings',
  ownerId: 'owner',
  activePeriodId: 'legacy',
  currency: 'MXN',
  theme: 'system',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-09-09T02:01:42.410Z',
}
const newer = {
  ...settings,
  activePeriodId: 'august',
  updatedAt: '2026-09-09T02:29:06.083Z',
}

describe('period overlap resolution planning (no writes)', () => {
  it('classifies an exact equivalent separately', () => {
    expect(
      buildPeriodOverlapPlan(legacy, [{ ...legacy, id: 'canonical' }], [])
        .classification,
    ).toBe('EXACT_EQUIVALENT')
  })
  it('maps the incident income to July and occurrence to August without mutating inputs', () => {
    const dependencies = [
      dependency('income', 'income', '2026-07-31'),
      dependency('occurrence', 'recurringPaymentOccurrence', '2026-08-13'),
    ]
    const before = JSON.stringify({ legacy, dependencies })
    const plan = buildPeriodOverlapPlan(legacy, [july, august], dependencies)
    expect(plan.classification).toBe('TRUE_OVERLAP')
    expect(validatePeriodResolutionChoices(plan, {}, [])).toEqual({
      'income:income': 'july',
      'recurringPaymentOccurrence:occurrence': 'august',
    })
    expect(JSON.stringify({ legacy, dependencies })).toBe(before)
  })
  it('does not move expenses on both sides of the boundary to August', () => {
    const plan = buildPeriodOverlapPlan(
      legacy,
      [july, august],
      [
        dependency('a', 'expense', '2026-07-31'),
        dependency('b', 'expense', '2026-08-01'),
      ],
    )
    expect(validatePeriodResolutionChoices(plan, {}, [])).toEqual({
      'expense:a': 'july',
      'expense:b': 'august',
    })
    expect(() =>
      validatePeriodResolutionChoices(plan, { 'expense:a': 'august' }, []),
    ).toThrow()
  })
  it('requires a budget choice, including for tombstones', () => {
    for (const deletedAt of [null, '2026-09-01T00:00:00.000Z']) {
      const plan = buildPeriodOverlapPlan(
        legacy,
        [july, august],
        [{ ...dependency('b', 'categoryBudget', null), deletedAt }],
      )
      expect(plan.dependencies[0]?.classification).toBe('AMBIGUOUS')
      expect(() => validatePeriodResolutionChoices(plan, {}, [])).toThrow()
      expect(
        validatePeriodResolutionChoices(
          plan,
          { 'categoryBudget:b': 'august' },
          [],
        ),
      ).toEqual({ 'categoryBudget:b': 'august' })
    }
  })
  it('refuses to merge or overwrite an existing budget', () => {
    const plan = buildPeriodOverlapPlan(
      legacy,
      [july, august],
      [dependency('b', 'categoryBudget', null)],
    )
    expect(() =>
      validatePeriodResolutionChoices(plan, { 'categoryBudget:b': 'august' }, [
        {
          id: 'other',
          ownerId: 'owner',
          categoryId: 'category',
          periodId: 'august',
          deletedAt: null,
        },
      ]),
    ).toThrow('Ya existe')
  })
  it('also prevents two reassigned budgets from colliding', () => {
    const plan = buildPeriodOverlapPlan(
      legacy,
      [july, august],
      [
        dependency('a', 'categoryBudget', null),
        dependency('b', 'categoryBudget', null),
      ],
    )
    expect(() =>
      validatePeriodResolutionChoices(
        plan,
        { 'categoryBudget:a': 'august', 'categoryBudget:b': 'august' },
        [],
      ),
    ).toThrow('Ya existe')
  })
  it('blocks dates outside candidates instead of allowing invalid manual assignment', () => {
    const plan = buildPeriodOverlapPlan(
      legacy,
      [july, august],
      [dependency('a', 'income', '2026-09-01')],
    )
    expect(plan.dependencies[0]?.classification).toBe('UNRESOLVED')
    expect(() =>
      validatePeriodResolutionChoices(plan, { 'income:a': 'august' }, []),
    ).toThrow()
  })
  it('rejects overlapping candidates, cross-owner data, and a remotely existing local ID', () => {
    expect(() =>
      buildPeriodOverlapPlan(
        legacy,
        [july, { ...august, startDate: '2026-07-31' }],
        [],
      ),
    ).toThrow()
    expect(() =>
      buildPeriodOverlapPlan(legacy, [{ ...july, ownerId: 'other' }], []),
    ).toThrow()
    expect(() => buildPeriodOverlapPlan(legacy, [legacy], [])).toThrow()
    expect(() =>
      buildPeriodOverlapPlan(
        legacy,
        [july],
        [{ ...dependency('a', 'income', '2026-07-31'), ownerId: 'other' }],
      ),
    ).toThrow()
  })
  it('rejects stale choices and duplicate dependencies', () => {
    const plan = buildPeriodOverlapPlan(legacy, [july, august], [])
    expect(() =>
      validatePeriodResolutionChoices(plan, { unknown: 'august' }, []),
    ).toThrow()
    const row = dependency('a', 'income', '2026-07-31')
    expect(() => buildPeriodOverlapPlan(legacy, [july], [row, row])).toThrow()
  })
  it('preserves remote newer navigation when other preferences match', () => {
    expect(
      planPeriodNavigation(settings, newer, 'legacy', [july, august]),
    ).toEqual({ kind: 'REMOTE_NEWER', settings: newer })
  })
  it('does not discard a different local theme or currency', () => {
    for (const local of [
      { ...settings, theme: 'dark' as const },
      { ...settings, currency: 'USD' },
    ]) {
      expect(
        planPeriodNavigation(local, newer, 'legacy', [july, august]),
      ).toEqual({
        kind: 'REQUIRES_SELECTION',
        currency: local.currency,
        theme: local.theme,
      })
    }
  })
  it('never invents a selection when remote target is unavailable or not newer', () => {
    expect(planPeriodNavigation(settings, newer, 'legacy', [july]).kind).toBe(
      'REQUIRES_SELECTION',
    )
    expect(
      planPeriodNavigation(
        settings,
        { ...newer, updatedAt: settings.updatedAt },
        'legacy',
        [july, august],
      ).kind,
    ).toBe('REQUIRES_SELECTION')
  })
})
