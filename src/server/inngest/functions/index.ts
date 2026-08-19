/**
 * Barrel of every Inngest function. `server/api/inngest.ts` registers this
 * list with `serve()`; a function that isn't exported here doesn't exist to
 * Inngest. One line per worker keeps "what runs in this app" greppable.
 *
 * Prod-gated functions (Daylight idiom: `export const fn = VERCEL_ENV ===
 * 'production' ? inngest.createFunction(...) : null`) are exported as `null`
 * outside production; the serve handler filters nulls out.
 */
export { generateDigest } from './generate-digest'
