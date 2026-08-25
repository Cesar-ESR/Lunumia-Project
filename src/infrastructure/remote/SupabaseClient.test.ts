import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseClient } from './SupabaseClient'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ kind: 'supabase-client' })),
}))

describe('createSupabaseClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserva PKCE y la persistencia local de sesión para el cliente web', () => {
    createSupabaseClient({
      url: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_test',
    })

    expect(createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'sb_publishable_test',
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      },
    )
  })
})
