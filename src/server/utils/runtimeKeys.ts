/**
 * Single source of truth for "is X wired up?" across the cosmo demo.
 *
 * Every external dependency (Supabase, AI providers, Stripe, Resend, Inngest)
 * is optional — cosmo boots clean with `.env` missing. Endpoints that need a
 * given service call the matching `isXConfigured()` and short-circuit to
 * canned/demo responses when it returns false.
 *
 * Reading order: `useRuntimeConfig()` when an H3 event is available
 * (preferred — picks up Vercel runtime injection), then `process.env` for
 * workers / module-eval / Inngest contexts where the runtime config isn't
 * yet bound. The three Supabase values are the exception: they come straight
 * from `process.env` through the SAME fallback chain `nuxt.config.ts` feeds
 * the @nuxtjs/supabase module (`SUPABASE_KEY || SUPABASE_PUBLISHABLE_KEY ||
 * SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY`), so
 * an old-named `.env` or the Vercel↔Supabase integration can never leave the
 * module live while the app thinks it's in demo mode.
 *
 * Keep this file dependency-free so it can be imported anywhere on the
 * server, including module-eval paths.
 */

import type { H3Event } from 'h3'

interface ResolvedKeys {
  supabaseUrl: string
  supabaseKey: string
  supabaseSecretKey: string
  aiGatewayApiKey: string
  stripeSecretKey: string
  resendApiKey: string
  inngestEventKey: string
  inngestSigningKey: string
}

/**
 * Dummy values we silently substitute for the @nuxtjs/supabase module when
 * the real env vars aren't set. They satisfy the module's startup validator
 * but never produce a working client — every call site guards with
 * `isSupabaseConfigured()` and short-circuits before touching the network.
 */
export const DEMO_SUPABASE_URL = 'https://demo.supabase.invalid'
export const DEMO_SUPABASE_KEY = 'demo-anon-key'

/**
 * The three Supabase values, straight from `process.env`, new names first and
 * legacy names honored. Mirror of the chain in `nuxt.config.ts` — change one,
 * change both.
 */
export function supabaseEnv() {
  return {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_KEY
      || process.env.SUPABASE_PUBLISHABLE_KEY
      || process.env.SUPABASE_ANON_KEY
      || '',
    secretKey: process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || ''
  }
}

/** For the boot banner: what's set, and whether any of it is under a legacy name. */
export function describeSupabaseEnv() {
  const env = supabaseEnv()
  const legacyNames = (['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const)
    .filter(name => Boolean(process.env[name]))
  return {
    present: [env.url, env.key, env.secretKey].filter(Boolean).length,
    legacyNames
  }
}

function readKeys(event?: H3Event): ResolvedKeys {
  let cfg: Record<string, unknown> = {}
  try {
    cfg = useRuntimeConfig(event) as unknown as Record<string, unknown>
  } catch {
    // No runtime config available (worker / module-eval). Fall back to env.
  }

  const get = (key: string, env: string): string => {
    const fromCfg = cfg[key]
    if (typeof fromCfg === 'string' && fromCfg) return fromCfg
    return process.env[env] || ''
  }

  const supabase = supabaseEnv()

  return {
    supabaseUrl: supabase.url,
    supabaseKey: supabase.key,
    supabaseSecretKey: supabase.secretKey,
    aiGatewayApiKey: get('aiGatewayApiKey', 'AI_GATEWAY_API_KEY'),
    stripeSecretKey: get('stripeSecretKey', 'STRIPE_SECRET_KEY'),
    resendApiKey: get('resendApiKey', 'RESEND_API_KEY'),
    inngestEventKey: get('inngestEventKey', 'INNGEST_EVENT_KEY'),
    inngestSigningKey: get('inngestSigningKey', 'INNGEST_SIGNING_KEY')
  }
}

function isReal(value: string, demoMarker?: string): boolean {
  if (!value) return false
  if (demoMarker && value === demoMarker) return false
  return true
}

export function isSupabaseConfigured(event?: H3Event): boolean {
  const k = readKeys(event)
  return (
    isReal(k.supabaseUrl, DEMO_SUPABASE_URL)
    && isReal(k.supabaseKey, DEMO_SUPABASE_KEY)
    && isReal(k.supabaseSecretKey)
  )
}

/** True when the AI Gateway key is present — the only AI path cosmo ships. */
export function isAIConfigured(event?: H3Event): boolean {
  return Boolean(readKeys(event).aiGatewayApiKey)
}

export function isStripeConfiguredFromKeys(event?: H3Event): boolean {
  return Boolean(readKeys(event).stripeSecretKey)
}

export function isResendConfigured(event?: H3Event): boolean {
  return Boolean(readKeys(event).resendApiKey)
}

export function isInngestConfigured(event?: H3Event): boolean {
  const k = readKeys(event)
  return Boolean(k.inngestEventKey && k.inngestSigningKey)
}

/**
 * Demo mode = no Supabase. The whole app falls back to a single in-memory
 * fixture user; endpoints short-circuit to canned responses.
 */
export function isDemoMode(event?: H3Event): boolean {
  return !isSupabaseConfigured(event)
}

/**
 * Stable identifiers for the demo fixture user / org. Persisted across the
 * process lifetime; reset when the dev server restarts.
 */
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001'
export const DEMO_ORG_ID = '00000000-0000-4000-8000-0000000000aa'
export const DEMO_MEMBERSHIP_ID = '00000000-0000-4000-8000-0000000000bb'
export const DEMO_USER_EMAIL = 'demo@cosmo.local'
export const DEMO_USER_NAME = 'Demo User'
export const DEMO_ORG_NAME = 'Demo Org'
export const DEMO_ORG_SLUG = 'demo'
