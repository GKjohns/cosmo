/**
 * POST /api/stripe/webhook
 *
 * Stub mode: returns `{ ok: true, stub: true }` so a clone with no Stripe
 * configured can still safely receive a misdirected request without 500s.
 *
 * Live mode: ports Margin's full handler + Daylight's two safety rails.
 *   - Verifies signature against STRIPE_WEBHOOK_SECRET.
 *   - Ignores `livemode: false` events when VERCEL_ENV=production (a Stripe
 *     CLI forward or test-mode smoke checkout must never touch prod data).
 *   - Insert-first idempotency against `processed_stripe_events` (0011):
 *     unique-violation 23505 → `{ received: true, duplicate: true }`; any
 *     other insert error is logged and the event is processed anyway.
 *   - Routes checkout.session.completed → upsert subscriptions row.
 *   - Routes customer.subscription.{created,updated,deleted} → update subs.
 *   - Routes invoice.payment_failed → status='past_due'.
 *   - Logs analytics events via the cosmo `logAnalyticsEvent` helper.
 *
 * Lazy `await import('stripe')` keeps the SDK out of the cold path in stub mode.
 */
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseServiceRole } from '#supabase/server'
import { isStripeConfigured } from '../../utils/billing'
import { logAnalyticsEvent } from '../../utils/analytics'

export default defineEventHandler(async (event) => {
  if (!isStripeConfigured()) {
    return { ok: true, stub: true }
  }

  const StripeMod = await import('stripe')
  const Stripe = StripeMod.default
  const config = useRuntimeConfig(event)
  const stripe = new Stripe(config.stripeSecretKey as string)

  const body = await readRawBody(event)
  const signature = getHeader(event, 'stripe-signature')

  if (!body || !signature) {
    throw createError({ statusCode: 400, statusMessage: 'Missing body or signature.' })
  }

  const webhookSecret = config.stripeWebhookSecret as string | undefined
  if (!webhookSecret) {
    throw createError({ statusCode: 500, statusMessage: 'STRIPE_WEBHOOK_SECRET not configured.' })
  }

  let stripeEvent: import('stripe').default.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      typeof body === 'string' ? body : Buffer.from(body),
      signature,
      webhookSecret
    )
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err)
    throw createError({ statusCode: 400, statusMessage: 'Invalid signature.' })
  }

  // Test-mode events must never touch production data. The live endpoint
  // should only ever see livemode events, but a Stripe CLI forward or a
  // test-mode smoke checkout can slip a `livemode:false` event through — that
  // is how a phantom test "sale" polluted Daylight's funnel twice. In the real
  // prod deployment, acknowledge and ignore so Stripe stops retrying.
  // Dev/preview still process test events (that is how the webhook is exercised).
  if (stripeEvent.livemode === false && process.env.VERCEL_ENV === 'production') {
    console.warn(`[stripe-webhook] ignoring test-mode event ${stripeEvent.id} (${stripeEvent.type}) in production`)
    return { received: true, ignored: 'test_mode' }
  }

  // No generated database.types.ts yet: widen the `SupabaseClient<unknown>` the
  // module returns to the default (`any`-schema) client so `.from()` typechecks.
  const supabase = serverSupabaseServiceRole(event) as SupabaseClient

  // Idempotency: log the event id BEFORE doing any work. Stripe retries on any
  // non-2xx / timeout, so the same event can arrive twice; the primary key on
  // `processed_stripe_events` turns the second insert into a 23505 and we skip.
  // Any other failure (table missing, transient DB error) degrades gracefully —
  // the downstream upserts are keyed on the subscription, so reprocessing a
  // duplicate is already a row-level no-op.
  const { error: idempotencyError } = await supabase
    .from('processed_stripe_events')
    .insert({ event_id: stripeEvent.id, event_type: stripeEvent.type })

  if (idempotencyError) {
    if (idempotencyError.code === '23505') {
      console.log(`[stripe-webhook] duplicate event ${stripeEvent.id}, skipping`)
      return { received: true, duplicate: true }
    }
    console.warn(
      `[stripe-webhook] idempotency log failed (${idempotencyError.code ?? 'unknown'}: ${idempotencyError.message ?? ''}); processing anyway`
    )
  }

  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object as import('stripe').default.Checkout.Session
      await handleCheckoutCompleted(event, supabase, stripe, session, stripeEvent.type)
      break
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = stripeEvent.data.object as import('stripe').default.Subscription
      await handleSubscriptionUpdate(event, supabase, subscription, stripeEvent.type)
      break
    }
    case 'customer.subscription.deleted': {
      const subscription = stripeEvent.data.object as import('stripe').default.Subscription
      await handleSubscriptionDeleted(event, supabase, subscription, stripeEvent.type)
      break
    }
    case 'invoice.payment_failed': {
      const invoice = stripeEvent.data.object as import('stripe').default.Invoice
      await handlePaymentFailed(event, supabase, invoice, stripeEvent.type)
      break
    }
    default:
      break
  }

  return { received: true }
})

/**
 * Stripe's current typings moved `current_period_*` onto subscription items;
 * the webhook payload still carries them at the top level. Read them loosely.
 */
function periodOf(subscription: import('stripe').default.Subscription) {
  return subscription as unknown as { current_period_start: number, current_period_end: number }
}

async function handleCheckoutCompleted(
  event: H3Event,
  supabase: SupabaseClient,
  stripe: import('stripe').default,
  session: import('stripe').default.Checkout.Session,
  stripeEventType: string
) {
  const organizationId = session.metadata?.organization_id
  if (!organizationId) {
    console.error('[stripe-webhook] no organization_id in checkout session metadata')
    return
  }

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string)

  await supabase.from('subscriptions').upsert({
    organization_id: organizationId,
    stripe_customer_id: session.customer as string,
    stripe_subscription_id: subscription.id,
    stripe_price_id: subscription.items.data[0]?.price.id,
    status: subscription.status,
    current_period_start: new Date(periodOf(subscription).current_period_start * 1000).toISOString(),
    current_period_end: new Date(periodOf(subscription).current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end
  }, { onConflict: 'organization_id' })

  void logAnalyticsEvent(event, 'subscription_created', {
    organizationId,
    stripeSubscriptionId: subscription.id,
    priceId: subscription.items.data[0]?.price.id
  }, {
    stripeEventType,
    stripeObjectId: subscription.id
  }, { actorId: null })
}

async function handleSubscriptionUpdate(
  event: H3Event,
  supabase: SupabaseClient,
  subscription: import('stripe').default.Subscription,
  stripeEventType: string
) {
  let organizationId = subscription.metadata?.organization_id
  if (!organizationId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('organization_id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle()
    organizationId = data?.organization_id
    if (!organizationId) {
      console.error('[stripe-webhook] cannot find organization for subscription', subscription.id)
      return
    }
  }

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle()

  await supabase.from('subscriptions').update({
    status: subscription.status,
    current_period_start: new Date(periodOf(subscription).current_period_start * 1000).toISOString(),
    current_period_end: new Date(periodOf(subscription).current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    stripe_price_id: subscription.items.data[0]?.price.id
  }).eq('stripe_subscription_id', subscription.id)

  // One registry event for both `customer.subscription.created` (activation)
  // and `.updated` (plan change / status flip); `stripeEventType` in the
  // payload keeps them separable in SQL.
  void logAnalyticsEvent(event, 'subscription_updated', {
    organizationId,
    previousStatus: existing?.status ?? null,
    newStatus: subscription.status,
    stripeSubscriptionId: subscription.id,
    stripeEventType
  }, {
    stripeEventType,
    stripeObjectId: subscription.id
  }, { actorId: null })
}

async function handleSubscriptionDeleted(
  event: H3Event,
  supabase: SupabaseClient,
  subscription: import('stripe').default.Subscription,
  stripeEventType: string
) {
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('organization_id')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle()

  await supabase.from('subscriptions').update({ status: 'canceled' })
    .eq('stripe_subscription_id', subscription.id)

  void logAnalyticsEvent(event, 'subscription_canceled', {
    organizationId: existing?.organization_id ?? null,
    stripeSubscriptionId: subscription.id,
    cancelAtPeriodEnd: subscription.cancel_at_period_end
  }, {
    stripeEventType,
    stripeObjectId: subscription.id
  }, { actorId: null })
}

async function handlePaymentFailed(
  event: H3Event,
  supabase: SupabaseClient,
  invoice: import('stripe').default.Invoice,
  stripeEventType: string
) {
  const subscriptionId = (invoice as unknown as { subscription?: string | null }).subscription ?? null
  if (!subscriptionId) return

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('organization_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()

  await supabase.from('subscriptions').update({ status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId)

  void logAnalyticsEvent(event, 'invoice_payment_failed', {
    organizationId: existing?.organization_id ?? null,
    stripeSubscriptionId: subscriptionId,
    amountDue: invoice.amount_due ?? null,
    currency: invoice.currency ?? null
  }, {
    stripeEventType,
    stripeObjectId: invoice.id
  }, { actorId: null })
}
