import { createClient } from 'npm:@supabase/supabase-js@2.111.0'
import { createDeleteAccountHandler } from './handler.ts'
import { readAllowedOrigins } from '../_shared/environment.ts'

const corsHeaders: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const allowedOrigins = readAllowedOrigins([
  Deno.env.get('ALLOWED_ORIGIN'),
  Deno.env.get('ALLOWED_ORIGINS'),
])

const missingEnvVars: string[] = []
if (!supabaseUrl) missingEnvVars.push('SUPABASE_URL')
if (!anonKey) missingEnvVars.push('SUPABASE_ANON_KEY')
if (!serviceRoleKey) missingEnvVars.push('SUPABASE_SERVICE_ROLE_KEY')

let innerHandler: ((request: Request) => Promise<Response>) | null = null

if (missingEnvVars.length > 0) {
  console.error(
    `[delete-account] Error de inicialización: faltan variables de entorno requeridas: ${missingEnvVars.join(', ')}`,
  )
} else {
  try {
    const adminClient = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    innerHandler = createDeleteAccountHandler({
      allowedOrigins,
      verifyToken: async (token) => {
        const userClient = createClient(supabaseUrl!, anonKey!, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        })
        const { data, error } = await userClient.auth.getUser()
        return error || !data.user ? null : { userId: data.user.id }
      },
      deleteUserData: async (userId) => {
        const { error } = await adminClient.rpc('delete_user_data', {
          target_user_id: userId,
        })
        if (error) throw new Error('No se pudieron eliminar los datos remotos.')
      },
      deleteAuthUser: async (userId) => {
        const { error } = await adminClient.auth.admin.deleteUser(userId)
        if (error)
          throw new Error('No se pudo eliminar la identidad de autenticación.')
      },
    })
  } catch (initErr) {
    console.error(
      '[delete-account] Error fatal durante la inicialización:',
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
        '[delete-account] Invocación rechazada: configuración de entorno incompleta en el servidor.',
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
      '[delete-account] Excepción no controlada en ejecución:',
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
