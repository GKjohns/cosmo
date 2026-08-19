/**
 * Single source of truth for "is Stripe wired up?".
 *
 * Read by every billing endpoint and composable. When false, those endpoints
 * MUST NOT import the `stripe` SDK at module-eval time — they short-circuit
 * to canned responses, and only `await import('stripe')` inside the live
 * branch. That keeps a fresh cosmo clone (with no Stripe account) boot-clean.
 *
 * Flip to live by setting `STRIPE_SECRET_KEY` in `.env`.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

/**
 * Stub URLs we redirect to in stub mode so the loop is followable without keys.
 * The billing page reads `?demo=checkout` / `?demo=portal` and renders an
 * inline banner explaining the stub.
 */
export const STUB_CHECKOUT_URL = '/app/billing?demo=checkout'
export const STUB_PORTAL_URL = '/app/billing?demo=portal'
