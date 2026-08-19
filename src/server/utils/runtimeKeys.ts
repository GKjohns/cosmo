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
 * yet bound.
 *
 * Keep this file dependency-free so it can be imported anywhere on the
 * server, including module-eval paths.
 */

import type { H3Event } from 'h3'

interface ResolvedKeys {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  openaiApiKey: string
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
export const DEMO_SUPABASE_ANON_KEY = 'demo-anon-key'

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

  return {
    supabaseUrl: get('supabaseUrl', 'SUPABASE_URL'),
    supabaseAnonKey: get('supabaseAnonKey', 'SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: get('supabaseServiceRoleKey', 'SUPABASE_SERVICE_ROLE_KEY'),
    openaiApiKey: get('openaiApiKey', 'OPENAI_API_KEY'),
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
    isReal(k.supabaseUrl, DEMO_SUPABASE_URL) &&
    isReal(k.supabaseAnonKey, DEMO_SUPABASE_ANON_KEY) &&
    isReal(k.supabaseServiceRoleKey)
  )
}

/** True when there's any way to call an AI model — gateway or direct OpenAI. */
export function isAIConfigured(event?: H3Event): boolean {
  const k = readKeys(event)
  return Boolean(k.aiGatewayApiKey || k.openaiApiKey)
}

/** True when the AI Gateway key is present (preferred path in the demo). */
export function isAIGatewayConfigured(event?: H3Event): boolean {
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
