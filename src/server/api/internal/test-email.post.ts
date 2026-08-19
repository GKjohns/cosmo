import { serverSupabaseClient } from '#supabase/server'
import { requireEmployee } from '../../utils/auth'
import { sendEmail, renderEditorialEmail, renderEditorialEmailText } from '../../utils/email'

/**
 * Fire a test transactional email through the Resend wrapper. Employee-only.
 *
 * Honors the same guards as production sends:
 *   - `RESEND_ALLOW_SEND=1` required outside production (the dev gate)
 *   - `RESEND_API_KEY` required (otherwise returns `skipped_missing_config`)
 *   - per-user dedupe (the dedupeKey embeds a timestamp so each click is its
 *     own row in `email_sends`)
 *
 * The recipient is always the calling employee — there is no way to specify a
 * `to` address from the client. This avoids "send a test email to whoever I
 * type in" abuse and matches Margin/Daylight's pattern.
 */
export default defineEventHandler(async (event): Promise<{ status: string, error?: string, dedupeKey: string }> => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireEmployee(event, supabase)

  // sendEmail() will short-circuit on `skipped_employee` because the calling
  // user is an employee. To exercise the full Resend path we temporarily
  // unset the employee guard for this one synthetic dedupe — but only for the
  // smoke flow. Margin and Daylight do this by writing the row with
  // `template = 'dev_smoke'` and bypassing the employee skip. Cosmo's
  // sendEmail keeps the employee skip; the dev-tools button will report
  // `skipped_employee` and that's the expected truth. The point of the smoke
  // is to verify the wrapper resolves end-to-end, including the guard.

  const dedupeKey = `dev_smoke:${Date.now()}`

  const html = renderEditorialEmail({
    eyebrow: 'Smoke test',
    headline: 'Resend wrapper is alive',
    bodyParagraphs: [
      'This is a synthetic email fired from the cosmo dev-tools page.',
      'If you received it, the Resend integration is wired correctly. If the response said "skipped_employee" or "skipped_dev_gate", that\'s also fine — both mean the guards are doing their job.'
    ],
    ctaLabel: 'Open dev-tools',
    ctaUrl: `${getRequestURL(event).origin}/app/dev-tools`,
    signoff: 'Cosmo Dev Tools'
  })

  const text = renderEditorialEmailText({
    eyebrow: 'Smoke test',
    headline: 'Resend wrapper is alive',
    bodyParagraphs: [
      'This is a synthetic email fired from the cosmo dev-tools page.',
      'If you received it, the Resend integration is wired correctly. If the response said "skipped_employee" or "skipped_dev_gate", that\'s also fine — both mean the guards are doing their job.'
    ],
    ctaLabel: 'Open dev-tools',
    ctaUrl: `${getRequestURL(event).origin}/app/dev-tools`,
    signoff: 'Cosmo Dev Tools'
  })

  const result = await sendEmail({
    userId,
    template: 'dev_smoke',
    dedupeKey,
    subject: 'Cosmo dev-tools smoke test',
    html,
    text
  })

  return {
    status: result.status,
    error: result.error,
    dedupeKey
  }
})
