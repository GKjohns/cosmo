/**
 * Service-role Supabase client for code that runs OUTSIDE a request: Inngest
 * functions, cron work, the email layer. Request handlers should use
 * `serverSupabaseServiceRole(event)` from `#supabase/server` instead — it's
 * per-event, retrying, and already configured by the module.
 *
 * Reads `process.env` directly (Daylight shape) because `useRuntimeConfig()`
 * isn't reliably bound in worker contexts, and honors the legacy names via
 * the same fallback chain as `runtimeKeys.ts`.
 *
 * Returns `null` in demo mode so callers no-op ("skipped: demo") instead of
 * throwing "supabaseUrl is required" from inside a worker.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseEnv } from './runtimeKeys'

export function createServiceClient(): SupabaseClient | null {
  const { url, secretKey } = supabaseEnv()
  if (!url || !secretKey) return null
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}
