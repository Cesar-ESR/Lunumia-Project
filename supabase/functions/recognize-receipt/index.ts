import { createClient } from 'npm:@supabase/supabase-js@2.111.0'
import { createRecognizeReceiptHandler } from './handler.ts'
import { createOCRProvider } from './providers/ProviderFactory.ts'
import {
  readAllowedOrigins,
  readProviderTimeout,
} from '../_shared/environment.ts'
import { PostgresRateLimiter } from '../_shared/distributed-rate-limiter.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const publishableKey =
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
  Deno.env.get('SUPABASE_ANON_KEY') ??
  ''
const providerName = Deno.env.get('OCR_PROVIDER') ?? ''
const runtimeEnvironment = Deno.env.get('OCR_ENVIRONMENT') ?? 'production'
const timeoutMs = readProviderTimeout(Deno.env.get('OCR_TIMEOUT_MS'))
const allowedOrigins = readAllowedOrigins([
  Deno.env.get('ALLOWED_ORIGIN') ?? '',
  Deno.env.get('ALLOWED_ORIGINS') ?? '',
])

if (!supabaseUrl || !publishableKey)
  throw new Error(
    'La Edge Function recognize-receipt no tiene configuración pública de Supabase.',
  )

const authClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const handler = createRecognizeReceiptHandler({
  allowedOrigins,
  timeoutMs,
  rateLimiter: new PostgresRateLimiter(
    (token) =>
      createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }),
    'recognize-receipt',
  ),
  verifyToken: async (token) => {
    const { data, error } = await authClient.auth.getUser(token)
    return error || !data.user ? null : { userId: data.user.id }
  },
  createProvider: () =>
    createOCRProvider({ provider: providerName, runtimeEnvironment }),
})

Deno.serve(handler)
