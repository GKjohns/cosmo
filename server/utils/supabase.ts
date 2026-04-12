import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function serverSupabaseAdmin() {
  if (_client) {
    return _client
  }

  const config = useRuntimeConfig()

  _client = createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  return _client
}
