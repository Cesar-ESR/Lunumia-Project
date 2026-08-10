import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAIAvailability } from './useAIAvailability'

const connectivity = vi.hoisted(() => ({
  authStatus: 'authenticated',
  user: { id: 'user-1' } as { id: string } | null,
  isOnline: true,
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    status: connectivity.authStatus,
    user: connectivity.user,
  }),
}))

vi.mock('../context/SyncContext', () => ({
  useSync: () => ({ isOnline: connectivity.isOnline }),
}))

describe('useAIAvailability', () => {
  beforeEach(() => {
    connectivity.authStatus = 'authenticated'
    connectivity.user = { id: 'user-1' }
    connectivity.isOnline = true
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })
  })

  it('entrega online a la UI de IA usando el provider, no navigator.onLine', () => {
    const { result } = renderHook(() => useAIAvailability(true))
    expect(result.current).toBe(true)
  })

  it('pasa de startup offline a online sin quedar atrapado en false', () => {
    connectivity.isOnline = false
    const { result, rerender } = renderHook(() => useAIAvailability(true))
    expect(result.current).toBe(false)

    act(() => {
      connectivity.isOnline = true
      rerender()
    })
    expect(result.current).toBe(true)
  })

  it('permite la IA con sesión preservada cuando el provider ya está online', () => {
    connectivity.authStatus = 'offline-authenticated'
    const { result } = renderHook(() => useAIAvailability(true))
    expect(result.current).toBe(true)
  })
})
