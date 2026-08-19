import { vi } from 'vitest'
import { signWebhookPayload } from './webhook-signature'

/**
 * Fake Stripe instance covering the surface cosmo's handlers actually use:
 * `webhooks.constructEvent`, `checkout.sessions.create`,
 * `billingPortal.sessions.create`, `subscriptions.retrieve`. Extend as
 * handlers grow — keep it a hand-rolled object, not a full SDK mock.
 *
 * Wire it in with `vi.mock('stripe', …)` returning `{ default: class { … } }`
 * (see stripe-webhook.test.ts) since the handlers `await import('stripe')`.
 */
export interface StripeMockOptions {
  // When set, constructEvent returns this object instead of parsing.
  forceEvent?: unknown
  // When set, constructEvent throws (simulating a bad signature).
  throwOnConstruct?: Error
}

export function createStripeMock(opts: StripeMockOptions = {}) {
  // Second arg is Stripe's request-options bag (`{ idempotencyKey }`); the
  // checkout handler passes it, so the mock must accept and record both.
  const sessionsCreate = vi.fn(async (args: Record<string, unknown>, _options?: Record<string, unknown>) => ({
    id: 'cs_test_mock',
    url: 'https://checkout.stripe.com/test',
    ...args
  }))

  // Real signature math (same HMAC the SDK does), so a test that sends a
  // garbage `stripe-signature` header fails here the way it would in prod.
  const constructEvent = vi.fn((rawBody: string | Buffer, sig: string, secret: string) => {
    if (opts.throwOnConstruct) throw opts.throwOnConstruct
    if (opts.forceEvent) return opts.forceEvent
    const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
    const ts = /t=(\d+)/.exec(sig)?.[1]
    if (!ts || signWebhookPayload(text, secret, Number(ts)) !== sig) {
      throw new Error('No signatures found matching the expected signature for payload.')
    }
    return JSON.parse(text)
  })

  const subscriptionsRetrieve = vi.fn(async (id: string) => ({
    id,
    status: 'active',
    cancel_at_period_end: false,
    current_period_start: 1700000000,
    current_period_end: 1702592000,
    items: { data: [{ price: { id: 'price_test' } }] }
  }))

  const stripe = {
    webhooks: { constructEvent },
    checkout: { sessions: { create: sessionsCreate } },
    subscriptions: { retrieve: subscriptionsRetrieve },
    billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://billing.stripe.com/test' })) } }
  }

  return {
    stripe,
    spies: { sessionsCreate, constructEvent, subscriptionsRetrieve }
  }
}

export { signWebhookPayload }
