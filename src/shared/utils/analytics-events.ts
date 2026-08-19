/**
 * THE analytics event registry — single source of truth for every event name,
 * and cosmo's analytics dictionary: each value is the one-line description of
 * when the event fires and what its payload carries. There is no separate
 * guide doc; keep the descriptions honest and this file is the documentation.
 *
 * Why this file exists: in the parent projects (Margin, Daylight) event names
 * were bare string literals. A typo (`chat_craeted`) passes the server's shape
 * regex, writes fine, and silently vanishes from every funnel — usually
 * discovered weeks later. Keys here become a union type, so a typo is a
 * compile error and renames are mechanical.
 *
 * `as const satisfies Record<string, string>` is load-bearing: `as const` locks
 * the literal keys (which is what makes `AnalyticsEventType` useful) and
 * `satisfies` checks the value shape without widening. A plain
 * `: Record<string, string>` annotation would widen the keys to `string` and
 * destroy the typo safety entirely.
 *
 * Naming: snake_case `{entity}_{action}`. The analytics grouping is a **visit**
 * (`visit_id`) — never "session", which is auth's word.
 *
 * PII RULE (hard): payloads carry ids, lengths, counts, booleans and enums
 * only. Never message text, chat titles, emails, org names, or anything a
 * user typed. Query keys, never query values.
 *
 * Registry rule: every entry has a real call site (or is one of the two DB
 * triggers). `npm run check:analytics-events` diffs registry ↔ call sites.
 * Deliberately absent: `/internal` usage (excluded by the `internal` flag) and
 * settings clicks (`page_viewed` covers them).
 */
export const EVENTS = {
  // ---- Navigation ----
  page_viewed: 'auto: every client route change; payload { path, from_path, has_query, query_keys, referrer }',

  // ---- Auth lifecycle (DB triggers in 0004, not app code) ----
  user_signed_up: 'DB trigger on auth.users insert; payload { userId, signupMethod }',
  user_logged_in: 'DB trigger on auth.sessions insert; payload { userId }',

  // ---- Organizations ----
  org_created: 'server, POST /api/app/organizations; payload { organizationId } — never the name or slug',
  invitation_sent: 'server, POST /api/app/invitations; payload { organizationId, role, mode: invited|auto_added } — never the email',
  invitation_accepted: 'server, POST /api/app/invitations/accept; payload { organizationId, alreadyMember }',

  // ---- Chat ----
  chat_created: 'server, POST /api/chats; payload { chatId } — the first message is content, never logged',
  chat_message_sent: 'server, POST /api/chats/[id] onEnd; payload { chatId, model, message_count } — counts only, never text',

  // ---- Feedback ----
  feedback_form_viewed: 'client, FeedbackForm mounted; payload { isAuthenticated }',
  feedback_form_started: 'client, first keystroke in any feedback field; payload { isAuthenticated }',
  feedback_submitted: 'server, POST /api/feedback after the row lands; payload { feedbackId, isAuthenticated, hasEmail, allowContact, questionsAnswered }',

  // ---- Billing (Stripe webhook; no actor — payload carries organizationId) ----
  subscription_created: 'checkout.session.completed; payload { organizationId, stripeSubscriptionId, priceId }',
  subscription_updated: 'customer.subscription.created|updated; payload { organizationId, previousStatus, newStatus, stripeSubscriptionId, stripeEventType }',
  subscription_canceled: 'customer.subscription.deleted; payload { organizationId, stripeSubscriptionId, cancelAtPeriodEnd }',
  invoice_payment_failed: 'invoice.payment_failed; payload { organizationId, stripeSubscriptionId, amountDue, currency }',

  // ---- Workers ----
  digest_failed: 'Inngest generate-digest onFailure (Sprint 6); payload { runId, error_kind }'
} as const satisfies Record<string, string>

/** Every valid event name. `logEvent`'s first parameter is typed as this. */
export type AnalyticsEventType = keyof typeof EVENTS
