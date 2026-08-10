import { createClient } from '@supabase/supabase-js'
import {
  readAllowedOrigins,
  readProviderTimeout,
} from '../_shared/environment.ts'
import { PostgresRateLimiter } from '../_shared/distributed-rate-limiter.ts'
import { createAIProvider } from './providers/ProviderFactory.ts'
import { createAIInsightsHandler } from './router.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const publishableKey =
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
  Deno.env.get('SUPABASE_ANON_KEY') ??
  ''
const provider = Deno.env.get('AI_PROVIDER') ?? ''
const groqApiKey = Deno.env.get('GROQ_API_KEY') ?? ''
const groqModel = Deno.env.get('GROQ_MODEL') ?? ''
const runtimeEnvironment = Deno.env.get('AI_ENVIRONMENT') ?? 'production'
const timeoutMs = readProviderTimeout(Deno.env.get('AI_TIMEOUT_MS'))
const allowedOrigins = readAllowedOrigins([
  Deno.env.get('ALLOWED_ORIGIN'),
  Deno.env.get('ALLOWED_ORIGINS'),
])

if (!supabaseUrl || !publishableKey)
  throw new Error(
    'La Edge Function ai-insights no tiene configuración pública de Supabase.',
  )

const authClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const rateLimiter = new PostgresRateLimiter(
  (token) =>
    createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }),
  'ai-insights',
)
const handler = createAIInsightsHandler({
  allowedOrigins,
  timeoutMs,
  rateLimiter,
  now: Date.now,
  verifyToken: async (token) => {
    const { data, error } = await authClient.auth.getUser(token)
    return error || !data.user ? null : { userId: data.user.id }
  },
  createProvider: () =>
    createAIProvider({
      provider,
      runtimeEnvironment,
      groqApiKey,
      groqModel,
    }),
})

Deno.serve(handler)
