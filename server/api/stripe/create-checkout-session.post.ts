/**
 * POST /api/stripe/create-checkout-session
 *
 * Stub mode (no STRIPE_SECRET_KEY): returns `{ url: '/app/billing?demo=checkout' }`.
 * The `stripe` SDK is NEVER imported at module-eval time. Live mode uses
 * `await import('stripe')` so a fresh clone with no Stripe account boots clean.
 *
 * Live mode: opens a Stripe Checkout session attached to `metadata.organization_id`,
 * reusing an existing customer if `subscriptions.stripe_customer_id` is set.
 */
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { isStripeConfigured, STUB_CHECKOUT_URL } from '../../utils/billing'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  if (!isStripeConfigured()) {
    return { url: STUB_CHECKOUT_URL, stub: true }
  }

  // Live branch: lazy-import Stripe so the SDK never loads in stub mode.
  const StripeMod = await import('stripe')
  const Stripe = StripeMod.default
  const config = useRuntimeConfig(event)
  const stripe = new Stripe(config.stripeSecretKey as string)

  const priceId = config.stripePriceId as string | undefined
  if (!priceId) {
    throw createError({ statusCode: 500, statusMessage: 'STRIPE_PRICE_ID not configured.' })
  }

  // Resolve the caller's active org. Use the same helper the rest of the
  // server-side code uses so org switching stays consistent.
  const membership = await requireActiveOrg(event, supabase, userId)

  // Look up an existing customer if any.
  const { data: existingSub } = await (supabase as any)
    .from('subscriptions')
    .select('stripe_customer_id, status')
    .eq('organization_id', membership.organizationId)
    .maybeSingle()

  if (existingSub?.status === 'active' || existingSub?.status === 'trialing') {
    throw createError({ statusCode: 400, statusMessage: 'Already on the Pro plan.' })
  }

  const requestUrl = getRequestURL(event)
  const sessionParams: import('stripe').default.Checkout.SessionCreateParams = {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${requestUrl.origin}/app/billing?success=true`,
    cancel_url: `${requestUrl.origin}/app/billing?canceled=true`,
    metadata: {
      organization_id: membership.organizationId,
      user_id: userId
    },
    subscription_data: {
      metadata: { organization_id: membership.organizationId }
    }
  }

  if (existingSub?.stripe_customer_id) {
    sessionParams.customer = existingSub.stripe_customer_id
  } else {
    const authUser = await serverSupabaseUser(event)
    if (authUser?.email) sessionParams.customer_email = authUser.email
  }

  const session = await stripe.checkout.sessions.create(sessionParams)
  return { url: session.url }
})
