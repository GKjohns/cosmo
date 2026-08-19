/**
 * Outbound email — Resend.
 *
 * Two exports:
 *   - sendEmail(opts):       transactional email to a user. Heavy guard rails
 *                            (employee skip, dedupe, dev gate).
 *   - sendAlertEmail(opts):  operator-only alert. Skips the user-protection
 *                            guards (we want every alert) but keeps the dev
 *                            gate so a developer running a worker locally
 *                            doesn't page themselves on every retry.
 *
 * Never throws. Failures are logged + (for sendEmail) written into email_sends
 * with status='failed' so we can audit later. Email is not on the critical
 * path of any user-facing request.
 *
 * Hard gate: outside NODE_ENV=production, sendEmail/sendAlertEmail no-op
 * unless RESEND_ALLOW_SEND=1. Dev .env should NOT have that var set; prod
 * env should. This is the most important guard in the file.
 *
 * Brand tokens (from address, alert recipient, retention floor) are read from
 * useRuntimeConfig() so projects parameterize via nuxt.config.ts / .env.
 */

import { Resend } from 'resend'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type AnyClient = SupabaseClient<any, any, any>

const RUNTIME_CONFIG = () => {
  // Inngest workers and cron jobs may not have access to useRuntimeConfig.
  // Read process.env directly with a runtimeConfig fallback for endpoints that do.
  try {
    const cfg = useRuntimeConfig()
    return {
      apiKey: (cfg.resendApiKey as string) || process.env.RESEND_API_KEY || '',
      from: (cfg.resendFrom as string) || process.env.RESEND_FROM || '',
      alertFrom: (cfg.resendAlertFrom as string) || process.env.RESEND_ALERT_FROM || '',
      alertTo: (cfg.resendAlertTo as string) || process.env.RESEND_ALERT_TO || '',
      allowSend: ((cfg.resendAllowSend as string) || process.env.RESEND_ALLOW_SEND || '') === '1'
    }
  } catch {
    return {
      apiKey: process.env.RESEND_API_KEY || '',
      from: process.env.RESEND_FROM || '',
      alertFrom: process.env.RESEND_ALERT_FROM || '',
      alertTo: process.env.RESEND_ALERT_TO || '',
      allowSend: process.env.RESEND_ALLOW_SEND === '1'
    }
  }
}

// Fallback brand tokens for the editorial chrome. Projects that lift the
// editorial helpers can override by passing a `brand` arg.
const DEFAULT_BRAND = {
  bg: '#FAFAF7',
  card: '#FFFFFF',
  ink: '#1A1612',
  inkSoft: '#54483A',
  inkMuted: '#8A8478',
  accent: '#0F172A', // slate-900 to match cosmo's slate primary
  rule: '#E0DED5',
  productName: 'Cosmo',
  serif: "Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",
  unsubscribeEmail: 'hello@example.com',
  tagline: 'Sent by Cosmo.'
}

export type EditorialBrand = Partial<typeof DEFAULT_BRAND>

export interface EditorialEmailContent {
  /** Small uppercase tagline above the headline. */
  eyebrow: string
  /** Serif headline. */
  headline: string
  /** Body paragraphs in serif. May contain `{firstName}` (substituted at send). */
  bodyParagraphs: string[]
  ctaLabel: string
  ctaUrl: string
  /** Sign-off name; defaults to brand product name. */
  signoff?: string
}

/**
 * Editorial-themed transactional email chrome. Cream background, white card,
 * serif headline + body, accent CTA button. Inline styles only — Gmail/Outlook
 * strip <style> blocks and class selectors.
 */
export function renderEditorialEmail(
  content: EditorialEmailContent,
  brand: EditorialBrand = {}
): string {
  const B = { ...DEFAULT_BRAND, ...brand }
  const eyebrow = escapeHtml(content.eyebrow.toUpperCase())
  const headline = escapeHtml(content.headline)
  const bodyHtml = content.bodyParagraphs
    .map(p => `<p style="margin:0 0 18px;font-family:${B.serif};font-size:17px;line-height:1.55;color:${B.inkSoft};">${escapeHtml(p)}</p>`)
    .join('\n            ')
  const ctaLabel = escapeHtml(content.ctaLabel)
  const ctaUrl = content.ctaUrl
  const signoff = escapeHtml(content.signoff || B.productName)

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:${B.bg};color:${B.ink};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${B.bg};padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr><td style="padding:0 0 24px;">
            <span style="font-family:${B.serif};font-size:22px;font-weight:700;letter-spacing:-0.01em;color:${B.accent};">${escapeHtml(B.productName)}</span>
          </td></tr>
          <tr><td style="background:${B.card};border:1px solid ${B.rule};border-radius:6px;padding:36px 36px 32px;">
            <p style="margin:0 0 20px;font-family:${B.sans};font-size:11px;letter-spacing:0.14em;font-weight:600;color:${B.accent};text-transform:uppercase;">${eyebrow}</p>
            <h1 style="margin:0 0 24px;font-family:${B.serif};font-size:28px;line-height:1.2;letter-spacing:-0.01em;color:${B.ink};font-weight:700;">${headline}</h1>
            <p style="margin:0 0 18px;font-family:${B.serif};font-size:17px;line-height:1.55;color:${B.inkSoft};">Hi {firstName},</p>
            ${bodyHtml}
            <p style="margin:28px 0 8px;">
              <a href="${ctaUrl}" style="background:${B.accent};color:#ffffff;padding:14px 28px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block;font-family:${B.sans};font-size:15px;letter-spacing:0.01em;">${ctaLabel}</a>
            </p>
            <p style="margin:32px 0 0;font-family:${B.serif};font-size:17px;line-height:1.4;color:${B.inkSoft};">Yours,<br>${signoff}</p>
          </td></tr>
          <tr><td style="padding:20px 36px 0;">
            <p style="margin:0;font-family:${B.sans};font-size:12px;line-height:1.5;color:${B.inkMuted};">
              ${escapeHtml(B.tagline)}
              <br>
              Reply with "unsubscribe" or email <a href="mailto:${B.unsubscribeEmail}?subject=Unsubscribe%20me" style="color:${B.inkMuted};text-decoration:underline;">${escapeHtml(B.unsubscribeEmail)}</a> to stop.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

/**
 * Plain-text fallback for the same content. Mail clients that strip HTML or
 * users who prefer plain text get this.
 */
export function renderEditorialEmailText(
  content: EditorialEmailContent,
  brand: EditorialBrand = {}
): string {
  const B = { ...DEFAULT_BRAND, ...brand }
  return [
    B.productName,
    '',
    content.eyebrow,
    '',
    content.headline,
    '',
    'Hi {firstName},',
    '',
    ...content.bodyParagraphs.flatMap(p => [p, '']),
    `${content.ctaLabel}: ${content.ctaUrl}`,
    '',
    'Yours,',
    content.signoff || B.productName,
    '',
    '---',
    `Reply with "unsubscribe" or email ${B.unsubscribeEmail} to stop.`
  ].join('\n')
}

export type EmailSendStatus
  = | 'sent'
    | 'failed'
    | 'skipped_employee'
    | 'skipped_no_email'
    | 'skipped_dev_gate'
    | 'skipped_missing_config'

export interface SendEmailOptions {
  userId: string
  template: string
  dedupeKey: string
  subject: string
  html: string
  text: string
}

export interface SendEmailResult {
  status: EmailSendStatus
  messageId?: string
  error?: string
}

export interface SendAlertEmailOptions {
  subject: string
  body: string
}

function envAllowsSend(): boolean {
  return process.env.NODE_ENV === 'production' || RUNTIME_CONFIG().allowSend
}

function envHasResendConfig(): { resend: Resend, from: string } | null {
  const cfg = RUNTIME_CONFIG()
  if (!cfg.apiKey) return null
  const from = cfg.from || 'Cosmo <onboarding@resend.dev>'
  return { resend: new Resend(cfg.apiKey), from }
}

function createServiceClient(): AnyClient {
  const url = process.env.SUPABASE_URL
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !secret) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in email.ts')
  }
  return createClient(url, secret, { auth: { persistSession: false } })
}

interface PgError { code?: string, message?: string }

type EmailSendsRow = {
  user_id: string
  template: string
  dedupe_key: string
  status: EmailSendStatus
  resend_message_id?: string | null
  error?: string | null
}
type EmailSendsClient = {
  from(table: 'email_sends'): {
    insert(row: EmailSendsRow): Promise<{ error: PgError | null }>
    update(patch: Partial<EmailSendsRow>): {
      eq(col: string, val: string): {
        eq(col: string, val: string): Promise<{ error: PgError | null }>
      }
    }
  }
}
const asEmailClient = (supabase: AnyClient): EmailSendsClient =>
  supabase as unknown as EmailSendsClient

async function writeSendRow(
  supabase: AnyClient,
  userId: string,
  template: string,
  dedupeKey: string,
  status: EmailSendStatus,
  resendMessageId?: string,
  error?: string
): Promise<{ unique_violation: boolean, table_missing: boolean }> {
  const { error: insertError } = await asEmailClient(supabase)
    .from('email_sends')
    .insert({
      user_id: userId,
      template,
      dedupe_key: dedupeKey,
      status,
      resend_message_id: resendMessageId ?? null,
      error: error ?? null
    })

  if (!insertError) return { unique_violation: false, table_missing: false }

  if (insertError.code === '23505') {
    return { unique_violation: true, table_missing: false }
  }
  if (insertError.code === '42P01') {
    console.warn('[email] email_sends table missing — migration 003 not applied; sending without dedupe')
    return { unique_violation: false, table_missing: true }
  }

  console.error('[email] writeSendRow failed:', insertError)
  return { unique_violation: false, table_missing: false }
}

async function updateSendRow(
  supabase: AnyClient,
  userId: string,
  dedupeKey: string,
  patch: { status?: EmailSendStatus, resend_message_id?: string, error?: string }
): Promise<void> {
  const { error } = await asEmailClient(supabase)
    .from('email_sends')
    .update(patch)
    .eq('user_id', userId)
    .eq('dedupe_key', dedupeKey)
  if (error && error.code !== '42P01') {
    console.error('[email] updateSendRow failed:', error)
  }
}

/**
 * Send a transactional email to a user. Returns the resolved status; never
 * throws. Pass the same dedupeKey twice (per user) → second call is a no-op.
 *
 * Order of operations:
 *   1. Short-circuit on missing Resend config.
 *   2. Short-circuit on dev-gate (NODE_ENV !== 'production' AND no RESEND_ALLOW_SEND).
 *   3. Read auth.users.email + profiles row; skip if employee / no email.
 *   4. Try-insert email_sends row; if unique violation, return early.
 *   5. Send via Resend; on success patch the row with the message id, on
 *      failure patch with status='failed' + error.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const { userId, template, dedupeKey, subject, html, text } = opts

  const supabase = createServiceClient()

  // 1. Missing config
  const config = envHasResendConfig()
  if (!config) {
    console.warn('[email] RESEND_API_KEY missing — skipping send', { template, userId })
    await writeSendRow(supabase, userId, template, dedupeKey, 'skipped_missing_config').catch(() => {})
    return { status: 'skipped_missing_config' }
  }

  // 2. Dev-gate
  if (!envAllowsSend()) {
    await writeSendRow(supabase, userId, template, dedupeKey, 'skipped_dev_gate').catch(() => {})
    return { status: 'skipped_dev_gate' }
  }

  // 3. Read user identity + profile guards
  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  const email = authUser?.user?.email ?? null

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_employee, display_name')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.is_employee) {
    await writeSendRow(supabase, userId, template, dedupeKey, 'skipped_employee').catch(() => {})
    return { status: 'skipped_employee' }
  }

  if (!email) {
    await writeSendRow(supabase, userId, template, dedupeKey, 'skipped_no_email').catch(() => {})
    return { status: 'skipped_no_email' }
  }

  // 4. Reserve dedupe row first (status='sent' optimistic)
  const insert = await writeSendRow(supabase, userId, template, dedupeKey, 'sent')
  if (insert.unique_violation) {
    return { status: 'sent' }
  }

  const firstName = profile?.display_name?.trim().split(/\s+/)[0] || 'there'
  const personalizedHtml = html.replace(/\{firstName\}/g, escapeHtml(firstName))
  const personalizedText = text.replace(/\{firstName\}/g, firstName)

  // 5. Send
  try {
    const result = await config.resend.emails.send({
      from: config.from,
      to: email,
      subject,
      html: personalizedHtml,
      text: personalizedText
    })

    if (result.error) {
      const errMsg = result.error.message || 'unknown resend error'
      console.error('[email] Resend send failed:', { template, userId, error: errMsg })
      if (!insert.table_missing) {
        await updateSendRow(supabase, userId, dedupeKey, { status: 'failed', error: errMsg })
      }
      return { status: 'failed', error: errMsg }
    }

    const messageId = result.data?.id
    if (messageId && !insert.table_missing) {
      await updateSendRow(supabase, userId, dedupeKey, { resend_message_id: messageId })
    }
    return { status: 'sent', messageId }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[email] Resend send threw:', { template, userId, error: errMsg })
    if (!insert.table_missing) {
      await updateSendRow(supabase, userId, dedupeKey, { status: 'failed', error: errMsg })
    }
    return { status: 'failed', error: errMsg }
  }
}

/**
 * Operator alert email. Skips dedupe + user-protection guards; we want every
 * alert. Keeps the dev-gate so debug sessions don't page on every retry. No
 * DB write. From / To addresses come from RESEND_ALERT_FROM / RESEND_ALERT_TO.
 */
export async function sendAlertEmail(opts: SendAlertEmailOptions): Promise<SendEmailResult> {
  const { subject, body } = opts

  const config = envHasResendConfig()
  if (!config) {
    console.warn('[email:alert] RESEND_API_KEY missing — skipping alert', { subject })
    return { status: 'skipped_missing_config' }
  }

  if (!envAllowsSend()) {
    return { status: 'skipped_dev_gate' }
  }

  const cfg = RUNTIME_CONFIG()
  const from = cfg.alertFrom || cfg.from || 'Cosmo Alerts <alerts@resend.dev>'
  const to = cfg.alertTo
  if (!to) {
    console.warn('[email:alert] RESEND_ALERT_TO not set — skipping alert', { subject })
    return { status: 'skipped_missing_config' }
  }

  try {
    const result = await config.resend.emails.send({
      from,
      to,
      subject,
      text: body
    })
    if (result.error) {
      const errMsg = result.error.message || 'unknown resend error'
      console.error('[email:alert] Resend send failed:', { subject, error: errMsg })
      return { status: 'failed', error: errMsg }
    }
    return { status: 'sent', messageId: result.data?.id }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[email:alert] Resend send threw:', { subject, error: errMsg })
    return { status: 'failed', error: errMsg }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
