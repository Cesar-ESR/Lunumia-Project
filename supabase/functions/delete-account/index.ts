import { createClient } from 'npm:@supabase/supabase-js@2.111.0'
import { createDeleteAccountHandler } from './handler.ts'
import { readAllowedOrigins } from '../_shared/environment.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const allowedOrigins = readAllowedOrigins([
  Deno.env.get('ALLOWED_ORIGIN'),
  Deno.env.get('ALLOWED_ORIGINS'),
])

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    'La Edge Function delete-account no tiene todas las variables requeridas.',
  )
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const handler = createDeleteAccountHandler({
  allowedOrigins,
  verifyToken: async (token) => {
    const userClient = createClient(supabaseUrl, anonKey, {
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

Deno.serve(handler)
