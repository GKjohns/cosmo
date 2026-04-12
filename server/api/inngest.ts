import { serve } from 'inngest/nuxt'
import { inngest } from '../utils/inngest'
import { processItem } from '../inngest/functions/process-item'
import { generateDigest } from '../inngest/functions/generate-digest'

export default serve({
  client: inngest,
  functions: [
    processItem,
    generateDigest
  ]
})
