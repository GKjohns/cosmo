/**
 * Minimal stand-ins for the Nuxt/Nitro auto-imports our endpoint handlers
 * lean on. Just enough to invoke a `defineEventHandler` default export from
 * a vitest test without bringing up Nitro. Import for side effect:
 * `import '../helpers/h3-globals'`.
 */

interface FakeError extends Error {
  statusCode: number
  statusMessage: string
}

type FakeEvent = {
  body?: unknown
  params?: Record<string, string>
  query?: Record<string, unknown>
  headers?: Record<string, string>
  rawBody?: string | null
} | undefined

const g = globalThis as Record<string, unknown>

export function installH3Globals() {
  g.defineEventHandler = (handler: (event: unknown) => unknown) => handler
  g.createError = (opts: { statusCode: number, statusMessage?: string }): FakeError => {
    const err = new Error(opts.statusMessage ?? 'Error') as FakeError
    err.statusCode = opts.statusCode
    err.statusMessage = opts.statusMessage ?? 'Error'
    return err
  }
  g.readBody = async (event: FakeEvent) => event?.body ?? {}
  g.readRawBody = async (event: FakeEvent) => event?.rawBody ?? null
  g.getHeader = (event: FakeEvent, name: string) => event?.headers?.[name.toLowerCase()]
  g.getRouterParam = (event: FakeEvent, name: string) => event?.params?.[name]
  g.getQuery = (event: FakeEvent) => event?.query ?? {}
  // Handlers read Stripe keys via useRuntimeConfig(); tests set process.env.
  g.useRuntimeConfig = () => ({
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    stripePriceId: process.env.STRIPE_PRICE_ID
  })
}

installH3Globals()
