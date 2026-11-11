import { describe, expect, it } from 'vitest'
import { classifyPeriodNavigationCandidate as classify, type CanonicalPeriodMetadata } from './PeriodNavigationCandidate'

const august: CanonicalPeriodMetadata = { id: 'august', ownerId: 'owner', type: 'monthly', startDate: '2026-08-01', endDate: '2026-08-31', deletedAt: null }
describe('Period navigation canonical compatibility', () => {
  it('matches a remote ID', () => expect(classify('owner', august, [august])).toBe('REMOTE_ID_MATCH'))
  it('accepts a safe local-only pending period', () => expect(classify('owner', { ...august, id: 'september', startDate: '2026-09-01', endDate: '2026-09-30' }, [august])).toBe('SAFE_LOCAL_ONLY'))
  it('distinguishes an exact alias from true overlap', () => expect(classify('owner', { ...august, id: 'alias' }, [august])).toBe('EXACT_REMOTE_EQUIVALENT'))
  it('rejects the July31/Aug31 legacy range', () => expect(classify('owner', { ...august, id: 'legacy', startDate: '2026-07-31' }, [august])).toBe('TRUE_OVERLAP'))
  it('rejects a missing candidate', () => expect(classify('owner', null, [august])).toBe('INVALID_LOCAL_REFERENCE'))
  it('rejects tombstones', () => expect(classify('owner', { ...august, deletedAt: '2026-09-01T00:00:00Z' }, [august])).toBe('INVALID_LOCAL_REFERENCE'))
  it('rejects another owner', () => expect(classify('other', august, [august])).toBe('INVALID_LOCAL_REFERENCE'))
  it('treats a shared end/start boundary as overlapping', () => expect(classify('owner', { ...august, id: 'next', startDate: '2026-08-31', endDate: '2026-09-30' }, [august])).toBe('TRUE_OVERLAP'))
  it('requires matching type for exact equivalence', () => expect(classify('owner', { ...august, id: 'alias', type: 'biweekly' }, [august])).toBe('TRUE_OVERLAP'))
})
