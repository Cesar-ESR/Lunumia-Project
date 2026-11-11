import { createClient } from 'npm:@supabase/supabase-js@2.111.0'
import { createRecognizeReceiptHandler } from './handler.ts'
import { createOCRProvider } from './providers/ProviderFactory.ts'
import { readProviderTimeout } from '../_shared/environment.ts'
import { readConfiguredAllowedOrigins } from '../_shared/cors-environment.ts'
import { PostgresRateLimiter } from '../_shared/distributed-rate-limiter.ts'

const corsHeaders: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const publishableKey =
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
const providerName = Deno.env.get('OCR_PROVIDER') ?? ''
const runtimeEnvironment = Deno.env.get('OCR_ENVIRONMENT') ?? 'production'
const timeoutMs = readProviderTimeout(Deno.env.get('OCR_TIMEOUT_MS'))
const groqApiKey = Deno.env.get('GROQ_API_KEY') ?? ''
const ocrModel = Deno.env.get('OCR_MODEL') ?? ''
const allowedOrigins = readConfiguredAllowedOrigins(
  Deno.env.get('ALLOWED_ORIGINS'),
  Deno.env.get('ALLOWED_ORIGIN'),
)

const missingEnvVars: string[] = []
if (!supabaseUrl) missingEnvVars.push('SUPABASE_URL')
if (!publishableKey) {
  missingEnvVars.push('SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY')
}

let innerHandler: ((request: Request) => Promise<Response>) | null = null

if (missingEnvVars.length > 0) {
  console.error(
    `[recognize-receipt] Error de inicialización: faltan variables de entorno requeridas: ${missingEnvVars.join(', ')}`,
  )
} else {
  try {
    const authClient = createClient(supabaseUrl!, publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    innerHandler = createRecognizeReceiptHandler({
      allowedOrigins,
      timeoutMs,
      rateLimiter: new PostgresRateLimiter(
        (token) =>
          createClient(supabaseUrl!, publishableKey!, {
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
        createOCRProvider({
          provider: providerName,
          runtimeEnvironment,
          groqApiKey,
          ocrModel,
        }),
    })
  } catch (initErr) {
    console.error(
      '[recognize-receipt] Error fatal durante la inicialización:',
      initErr instanceof Error ? initErr.stack : initErr,
    )
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const requestOrigin = req.headers.get('Origin')
  const effectiveCorsHeaders: HeadersInit = {
    ...corsHeaders,
    ...(requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin } : {}),
  }

  try {
    if (missingEnvVars.length > 0 || !innerHandler) {
      console.error(
        '[recognize-receipt] Invocación rechazada: configuración de entorno incompleta en el servidor.',
      )
      return new Response(
        JSON.stringify({
          error: 'Ocurrió un error interno en el servidor.',
          code: 'INTERNAL_SERVER_ERROR',
        }),
        {
          status: 500,
          headers: {
            ...effectiveCorsHeaders,
            'Content-Type': 'application/json',
          },
        },
      )
    }

    return await innerHandler(req)
  } catch (err) {
    console.error(
      '[recognize-receipt] Excepción no controlada en ejecución:',
      err instanceof Error ? err.stack : err,
    )
    return new Response(
      JSON.stringify({
        error: 'Ocurrió un error interno en el servidor.',
        code: 'INTERNAL_SERVER_ERROR',
      }),
      {
        status: 500,
        headers: {
          ...effectiveCorsHeaders,
          'Content-Type': 'application/json',
        },
      },
    )
  }
})
