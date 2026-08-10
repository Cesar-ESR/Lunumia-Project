import { z } from 'zod'

const SupabaseConfigSchema = z.object({
  url: z.url('VITE_SUPABASE_URL debe ser una URL válida.'),
  publishableKey: z
    .string()
    .trim()
    .min(1, 'VITE_SUPABASE_PUBLISHABLE_KEY es obligatoria.'),
})

export interface SupabaseConfig {
  url: string
  publishableKey: string
}

interface SupabaseEnvironment {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Compatibilidad temporal con proyectos Supabase que aún usan anon key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

export function readSupabaseConfig(
  env: SupabaseEnvironment = {
    VITE_SUPABASE_URL: import.meta.env['VITE_SUPABASE_URL'],
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env[
      'VITE_SUPABASE_PUBLISHABLE_KEY'
    ],
    VITE_SUPABASE_ANON_KEY: import.meta.env['VITE_SUPABASE_ANON_KEY'],
  },
): SupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const publishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ??
    env.VITE_SUPABASE_ANON_KEY?.trim() ??
    ''
  if (!url && !publishableKey) return null
  return SupabaseConfigSchema.parse({ url, publishableKey })
}
