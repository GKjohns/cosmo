/**
 * The one Inngest client. Functions import it from here; `inngest.send()`
 * callers too. Keep this module free of side effects — it's imported by
 * `/api/inngest` at module-eval.
 *
 * `isDev`: inngest v4 defaults to CLOUD mode and refuses to serve without
 * `INNGEST_SIGNING_KEY` ("In cloud mode but no signing key found"). Under
 * `nuxt dev` we want the local dev server (`npm run dev:inngest`, :8288) with
 * no keys at all, so dev mode is pinned to Nuxt's own dev flag. Outside dev it
 * is left `undefined` so the SDK's normal detection (`INNGEST_DEV=1`, or the
 * signing/event keys from Vercel) decides.
 */
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'cosmo',
  isDev: import.meta.dev || undefined
})
