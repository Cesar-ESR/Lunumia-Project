import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { readSupabaseConfig, type SupabaseConfig } from './supabase-config'

let singleton: SupabaseClient<Database> | null = null

export function createSupabaseClient(
  config: SupabaseConfig,
): SupabaseClient<Database> {
  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
}

export function getSupabaseClient(): SupabaseClient<Database> | null {
  const config = readSupabaseConfig()
  if (!config) return null
  singleton ??= createSupabaseClient(config)
  return singleton
}
