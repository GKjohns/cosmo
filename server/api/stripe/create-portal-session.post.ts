/**
 * POST /api/stripe/create-portal-session
 *
 * Stub mode: returns `{ url: '/app/billing?demo=portal' }`.
 * Live mode: redirects to Stripe Customer Portal for the active org's customer.
 *
 * Lazy-import pattern keeps `stripe` out of the cold path in stub mode.
 */
import { serverSupabaseClient } from '#supabase/server'
import { isStripeConfigured, STUB_PORTAL_URL } from '../../utils/billing'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  if (!isStripeConfigured()) {
    return { url: STUB_PORTAL_URL, stub: true }
  }

  const StripeMod = await import('stripe')
  const Stripe = StripeMod.default
  const config = useRuntimeConfig(event)
  const stripe = new Stripe(config.stripeSecretKey as string)

  const membership = await requireActiveOrg(event, supabase, userId)

  const { data: subscription, error } = await (supabase as any)
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', membership.organizationId)
    .maybeSingle()

  if (error || !subscription?.stripe_customer_id) {
    throw createError({ statusCode: 400, statusMessage: 'No Stripe customer for this organization.' })
  }

  const requestUrl = getRequestURL(event)
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${requestUrl.origin}/app/billing`
  })

  return { url: session.url }
})
