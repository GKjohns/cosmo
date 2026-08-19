import { afterEach, describe, expect, it } from 'vitest'
import { isStripeConfigured, STUB_CHECKOUT_URL, STUB_PORTAL_URL } from '../../utils/billing'

/**
 * Stub mode is the property every billing endpoint keys off. If this flips,
 * a fresh clone with no Stripe account starts importing the SDK at boot.
 */
describe('isStripeConfigured', () => {
  const original = process.env.STRIPE_SECRET_KEY

  afterEach(() => {
    if (original === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = original
  })

  it('is false when STRIPE_SECRET_KEY is unset', () => {
    delete process.env.STRIPE_SECRET_KEY
    expect(isStripeConfigured()).toBe(false)
  })

  it('is false when STRIPE_SECRET_KEY is the empty string', () => {
    process.env.STRIPE_SECRET_KEY = ''
    expect(isStripeConfigured()).toBe(false)
  })

  it('is true when STRIPE_SECRET_KEY holds a value', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc123'
    expect(isStripeConfigured()).toBe(true)
  })
})

describe('stub redirect URLs', () => {
  it('point back at the billing page with a demo flag', () => {
    expect(STUB_CHECKOUT_URL).toBe('/app/billing?demo=checkout')
    expect(STUB_PORTAL_URL).toBe('/app/billing?demo=portal')
  })
})
