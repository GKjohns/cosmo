/**
 * One line at boot saying which world we're in, so "why is everything demo
 * data?" is answered by the terminal instead of a debugging session.
 *
 * The legacy-name warning exists because the Vercel↔Supabase integration and
 * copied sibling `.env`s still inject `SUPABASE_ANON_KEY` /
 * `SUPABASE_SERVICE_ROLE_KEY`. Both are honored (same fallback chain as
 * `nuxt.config.ts` and `runtimeKeys.ts`) — but silently, which is exactly how
 * a prod deploy ends up in demo mode. Say so once, loudly.
 */
import { describeSupabaseEnv, isDemoMode } from '../utils/runtimeKeys'

export default defineNitroPlugin(() => {
  const env = describeSupabaseEnv()

  if (env.legacyNames.length) {
    console.warn(`legacy env names ${env.legacyNames.join('/')} detected — rename to SUPABASE_KEY/SUPABASE_SECRET_KEY`)
  }
  if (env.present > 0 && env.present < 3) {
    console.warn(`partial Supabase config (${env.present} of 3 vars) — need SUPABASE_URL, SUPABASE_KEY, SUPABASE_SECRET_KEY; staying in demo mode`)
  }

  console.log(isDemoMode() ? 'DEMO MODE (no Supabase env)' : 'Supabase: live')
})
