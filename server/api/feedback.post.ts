import { serverSupabaseClient } from '#supabase/server'
import { getOptionalUser } from '../utils/auth'
import { logAnalyticsEvent } from '../utils/analytics'

interface FeedbackBody {
  q1_trying_to_do?: string | null
  q2_blockers?: string | null
  q3_indispensable?: string | null
  email?: string | null
  allow_contact?: boolean | null
  page_context?: string | null
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Accept a feedback submission. Open to anon and authenticated traffic.
 * Authenticated submissions attribute to `auth.uid()`; anon may include an
 * email + opt-in to follow-up contact. The RLS policy enforces that authed
 * inserts can only set `user_id` to themselves.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await getOptionalUser(event, supabase)
  const body = await readBody<FeedbackBody>(event)

  const q1 = normalizeOptionalText(body?.q1_trying_to_do)
  const q2 = normalizeOptionalText(body?.q2_blockers)
  const q3 = normalizeOptionalText(body?.q3_indispensable)

  if (!q1 && !q2 && !q3) {
    throw createError({ statusCode: 400, statusMessage: 'Please answer at least one question' })
  }

  // Only store email + allow_contact when anonymous; otherwise the user_id is
  // the source of truth.
  const email = userId ? null : normalizeOptionalText(body?.email)
  const allow_contact = userId
    ? null
    : (email
        ? (typeof body?.allow_contact === 'boolean' ? body.allow_contact : true)
        : null)
  const page_context = normalizeOptionalText(body?.page_context)

  // Cast to `any` so missing-type-codegen doesn't block builds when projects
  // haven't run `supabase gen types` yet.
  const { data, error } = await (supabase as any)
    .from('feedback')
    .insert({
      user_id: userId,
      email,
      allow_contact,
      q1_trying_to_do: q1,
      q2_blockers: q2,
      q3_indispensable: q3,
      page_context
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    console.error('[POST /api/feedback] Failed to submit feedback:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to submit feedback' })
  }

  logAnalyticsEvent(event, 'feedback_received', {
    feedbackId: data.id,
    isAuthenticated: !!userId,
    hasEmail: !userId && !!email,
    allowContact: allow_contact,
    questionsAnswered: [
      q1 ? 'q1' : null,
      q2 ? 'q2' : null,
      q3 ? 'q3' : null
    ].filter(Boolean)
  })

  return { success: true, id: data.id }
})
