import { createHmac } from 'node:crypto'

/**
 * Produce a valid Stripe-Signature header for a payload + secret.
 * Matches the format Stripe expects: `t={timestamp},v1={hmac}`.
 *
 * Tests use this so they exercise the real `constructEvent` verification path
 * rather than bypassing it.
 */
export function signWebhookPayload(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000)
  const signedPayload = `${ts}.${payload}`
  const v1 = createHmac('sha256', secret).update(signedPayload).digest('hex')
  return `t=${ts},v1=${v1}`
}
