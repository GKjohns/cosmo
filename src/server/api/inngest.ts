/**
 * Inngest serve endpoint (`/api/inngest`) — the `inngest/nuxt` adapter.
 *
 * Every function in `server/inngest/functions/index.ts` is registered here.
 * The `.filter(fn => fn !== null)` drops prod-gated functions that export
 * `null` outside production (see the barrel), so `serve()` only ever sees
 * live functions. Anything that throws at module-eval in a function file
 * 500s this route and halts every worker — keep function modules side-effect
 * free at the top level.
 */
import { serve } from 'inngest/nuxt'
import { inngest } from '../utils/inngest'
import { generateDigest } from '../inngest/functions'

export default serve({
  client: inngest,
  functions: [
    generateDigest
  ].filter(fn => fn !== null)
})
