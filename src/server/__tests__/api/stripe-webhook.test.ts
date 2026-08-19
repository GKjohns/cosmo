import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import '../helpers/h3-globals'
import { createStripeMock, signWebhookPayload } from '../helpers/stripe-mock'
import { createSupabaseStub, type SupabaseStub } from '../helpers/supabase-mock'

/**
 * Pins the webhook's three safety rails: signature verification, insert-first
 * idempotency (`processed_stripe_events`), and the test-mode-in-prod gate.
 * The handler `await import('stripe')`s, so the SDK is mocked at the module
 * boundary; Supabase comes from the inline `#supabase/server` mock.
 */

const WEBHOOK_SECRET = 'whsec_test_secret_for_unit_tests_only'

// The handler is stub-mode until STRIPE_SECRET_KEY is set. Both keys are read
// through `useRuntimeConfig()` (h3-globals maps it onto process.env).
process.env.STRIPE_SECRET_KEY = 'sk_test_unit'
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET

// --- Stripe / Supabase / analytics mocks ---------------------------------------

let stripeMock = createStripeMock()
let supabaseStub: SupabaseStub = createSupabaseStub()
const analyticsSpy = vi.fn(async (..._args: unknown[]) => {})

vi.mock('stripe', () => ({
  // `new Stripe(key)` — a constructor function that hands back the current
  // mock (a constructor returning an object replaces `this`).
  default: function Stripe() {
    return stripeMock.stripe
  }
}))

vi.mock('#supabase/server', () => ({
  serverSupabaseServiceRole: vi.fn(() => supabaseStub),
  serverSupabaseClient: vi.fn(async () => supabaseStub),
  serverSupabaseUser: vi.fn(async () => null)
}))

vi.mock('../../utils/analytics', () => ({
  logAnalyticsEvent: (...args: unknown[]) => analyticsSpy(...args)
}))

const handler = (await import('../../api/stripe/webhook.post')).default as (event: unknown) => Promise<Record<string, unknown>>

// --- Test utilities ------------------------------------------------------------

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, '..', 'fixtures', 'stripe-events', `${name}.json`), 'utf8')
}

function signedRequest(fixtureName: string) {
  const rawBody = loadFixture(fixtureName)
  return { rawBody, headers: { 'stripe-signature': signWebhookPayload(rawBody, WEBHOOK_SECRET) } }
}

const originalVercelEnv = process.env.VERCEL_ENV

beforeEach(() => {
  // The rails under test log on purpose (bad signature, duplicate, ignored);
  // keep the run output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  analyticsSpy.mockClear()
  stripeMock = createStripeMock()
  supabaseStub = createSupabaseStub()
  delete process.env.VERCEL_ENV
})

afterEach(() => {
  vi.restoreAllMocks()
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalVercelEnv
})

// --- Tests ---------------------------------------------------------------------

describe('POST /api/stripe/webhook', () => {
  it('rejects a bad signature with 400 and touches nothing', async () => {
    const rawBody = loadFixture('subscription-created')
    await expect(handler({ rawBody, headers: { 'stripe-signature': 't=1,v1=deadbeef' } }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(supabaseStub.calls).toHaveLength(0)
  })

  it('rejects a missing body / signature with 400', async () => {
    await expect(handler({ rawBody: null, headers: {} })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('logs the event id first, processes it, and short-circuits on duplicate delivery', async () => {
    const first = await handler(signedRequest('subscription-created'))
    expect(first).toEqual({ received: true })

    const inserts = supabaseStub.writes('processed_stripe_events', 'insert')
    expect(inserts).toHaveLength(1)
    expect(inserts[0]!.args[0]).toEqual({
      event_id: 'evt_test_sub_created_001',
      event_type: 'customer.subscription.created'
    })
    // The subscription row was written and the analytics event fired.
    expect(supabaseStub.writes('subscriptions', 'update')).toHaveLength(1)
    expect(analyticsSpy).toHaveBeenCalledTimes(1)

    // Same event id again: the primary key raises 23505 and the handler skips.
    supabaseStub = createSupabaseStub({
      tables: {
        processed_stripe_events: verb => verb === 'insert'
          ? { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
          : {}
      }
    })
    analyticsSpy.mockClear()

    const second = await handler(signedRequest('subscription-created-duplicate'))
    expect(second).toEqual({ received: true, duplicate: true })
    expect(supabaseStub.writes('subscriptions')).toHaveLength(0)
    expect(analyticsSpy).not.toHaveBeenCalled()
  })

  it('processes anyway when the idempotency table is missing (42P01)', async () => {
    supabaseStub = createSupabaseStub({
      tables: {
        processed_stripe_events: verb => verb === 'insert'
          ? { error: { code: '42P01', message: 'relation "processed_stripe_events" does not exist' } }
          : {}
      }
    })
    const result = await handler(signedRequest('subscription-created'))
    expect(result).toEqual({ received: true })
    expect(supabaseStub.writes('subscriptions', 'update')).toHaveLength(1)
  })

  it('acknowledges and ignores test-mode events in production', async () => {
    process.env.VERCEL_ENV = 'production'
    const result = await handler(signedRequest('subscription-created-testmode'))
    expect(result).toEqual({ received: true, ignored: 'test_mode' })
    // Never reached the idempotency log or any table.
    expect(supabaseStub.calls).toHaveLength(0)
    expect(analyticsSpy).not.toHaveBeenCalled()
  })

  it('still processes test-mode events outside production (dev / preview)', async () => {
    process.env.VERCEL_ENV = 'preview'
    const result = await handler(signedRequest('subscription-created-testmode'))
    expect(result).toEqual({ received: true })
    expect(supabaseStub.writes('processed_stripe_events', 'insert')).toHaveLength(1)
  })
})
