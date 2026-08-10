import { describe, expect, it } from 'vitest'
import { resolveLastWriteWins } from './sync-conflict'

describe('resolveLastWriteWins', () => {
  it('elige el timestamp más reciente', () => {
    expect(
      resolveLastWriteWins(
        { id: 'b', updatedAt: '2026-08-01T10:00:00.000Z' },
        { id: 'a', updatedAt: '2026-08-01T11:00:00.000Z' },
      ),
    ).toBe('remote')
  })

  it('desempata timestamps iguales por id lexicográficamente mayor', () => {
    expect(
      resolveLastWriteWins(
        { id: 'a', updatedAt: '2026-08-01T10:00:00.000Z' },
        { id: 'b', updatedAt: '2026-08-01T10:00:00.000Z' },
      ),
    ).toBe('remote')
    expect(
      resolveLastWriteWins(
        { id: 'z', updatedAt: '2026-08-01T10:00:00.000Z' },
        { id: 'b', updatedAt: '2026-08-01T10:00:00.000Z' },
      ),
    ).toBe('local')
  })
})
