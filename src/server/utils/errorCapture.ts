import { createHash } from 'node:crypto'

/**
 * Pure helpers for the Nitro error hook (`server/plugins/error-capture.ts`).
 *
 * THE SANITIZATION WALL: `analytics.app_errors` is read by employees and by
 * Claude sessions running ad-hoc SQL, so no raw user content may reach it.
 * Error messages routinely echo user input (emails, ids, quoted values, file
 * names), so everything is normalized BEFORE both fingerprinting and storage.
 * Raw detail stays in the Vercel logs, which are not agent-readable.
 *
 * Sanitizing before fingerprinting is also what makes the counter work: one
 * bug must collapse to one row no matter which record it blew up on.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const UUID_SEGMENT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/**
 * Skip expected H3Error flows (createError 4xx, bot-scan 404s, the 401s every
 * API route throws for signed-out callers); capture 5xx and raw non-H3 throws,
 * which surface as 500s.
 */
export function shouldCaptureError(err: unknown): boolean {
  const statusCode = (err as { statusCode?: unknown } | null)?.statusCode
  if (typeof statusCode === 'number' && statusCode < 500) return false
  return true
}

/**
 * Strip anything that could be user content or per-request noise from an error
 * message: quoted values, emails, UUIDs, and long (>= 4 digit) numbers. The
 * result is used for BOTH the fingerprint and the stored message.
 */
export function normalizeErrorMessage(raw: string): string {
  let msg = raw.slice(0, 4000)
  // Quoted spans first: they are the likeliest carrier of user content, and
  // may themselves embed emails/ids we would otherwise partially preserve.
  msg = msg.replace(/'[^']*'/g, '\'<redacted>\'')
  msg = msg.replace(/"[^"]*"/g, '"<redacted>"')
  msg = msg.replace(/`[^`]*`/g, '`<redacted>`')
  msg = msg.replace(EMAIL_RE, '<email>')
  msg = msg.replace(UUID_RE, '<uuid>')
  // Long numbers: ids, ports, epoch timestamps. Short counts ("3 items") stay.
  msg = msg.replace(/\d{4,}/g, '<n>')
  return msg.replace(/\s+/g, ' ').trim().slice(0, 2000)
}

/**
 * Collapse dynamic path segments so /api/chats/abc-123/messages and
 * /api/chats/def-456/messages fingerprint identically. Query strings drop.
 */
export function normalizeRoutePath(path: string): string {
  const clean = (path || '').split('?')[0] ?? ''
  const collapsed = clean
    .split('/')
    .map((segment) => {
      if (!segment) return segment
      if (UUID_SEGMENT_RE.test(segment)) return ':id'
      if (/^\d+$/.test(segment)) return ':id'
      if (/^[0-9a-f]{8,}$/i.test(segment)) return ':id'
      // Mixed alphanumeric ids (abc-123, ses_8f3k2p). Static route segments
      // in this app carry no digits.
      if (/\d/.test(segment) && segment.length >= 6) return ':id'
      return segment
    })
    .join('/')
  return collapsed || '/'
}

/**
 * Stack sample: frames only ("at ..." lines or file:line patterns), never the
 * message line (already sanitized separately) or local values. Cap 4000 chars.
 */
export function extractStackFrames(stack: string | undefined | null): string | null {
  if (!stack) return null
  const frames = stack
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('at ') || /\S+\.(?:ts|js|mjs|cjs|vue):\d+/.test(line))
  if (frames.length === 0) return null
  return frames.join('\n').slice(0, 4000)
}

/** sha1 of `source|normalizedRoute|errName|normalizedMessage` — one bug, one row. */
export function errorFingerprint(
  source: string,
  normalizedRoute: string,
  errName: string,
  normalizedMessage: string
): string {
  return createHash('sha1')
    .update(`${source}|${normalizedRoute}|${errName}|${normalizedMessage}`)
    .digest('hex')
}
