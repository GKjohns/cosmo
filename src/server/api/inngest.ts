import { serve } from 'inngest/nuxt'
import { inngest } from '../utils/inngest'
import { generateDigest } from '../inngest/functions/generate-digest'

export default serve({
  client: inngest,
  functions: [
    generateDigest
  ]
})
