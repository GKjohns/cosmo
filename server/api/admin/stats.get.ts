import { serverSupabaseServiceRole, serverSupabaseClient } from '#supabase/server'
import { requireEmployee } from '../../utils/auth'

/**
 * Admin-dashboard aggregator. Parallel `Promise.all` over `public` + `analytics`
 * schemas. Lifted from Margin's `/api/admin/stats.get.ts`, adapted for cosmo's
 * data shape (cosmo has `items`, not Margin's `notebooks` / `analysis_briefs` /
 * `kernel_sessions`). Funnel is generic ("Created Item" / "Returned"), and
 * activity feed pulls from `analytics.events`.
 *
 * Profile rows in cosmo have no `email` column — we resolve emails from
 * `auth.admin.listUsers` in a single batch and build a map.
 *
 * Read-only. Service role is used because we need to see across users + the
 * analytics schema regardless of RLS. The `requireEmployee` guard at the top
 * is the only access check.
 */

// === Type Definitions ===

interface HeadlineStats {
  realUsers: number
  activeUsers: number
  contentCreated: number
  activationRate: number
}

interface UserSignup {
  id: string
  email: string | null
  displayName: string | null
  signupDate: string
  itemsCreated: number
  eventsLogged: number
  isTestUser: boolean
  status: 'engaged' | 'started' | 'bounced'
}

interface FunnelStep {
  name: string
  count: number
  percentage: number
}

interface FeedbackItem {
  id: string
  createdAt: string
  email: string | null
  displayName: string | null
  q1TryingToDo: string | null
  q2Blockers: string | null
  q3Indispensable: string | null
  pageContext: string | null
}

interface ActivityEvent {
  timestamp: string
  eventType: string
  userEmail: string | null
  userName: string | null
  route: string | null
}

interface ErrorEvent {
  timestamp: string
  eventType: string
  errorMessage: string
  userEmail: string | null
  route: string | null
}

interface EventTypeSummary {
  eventType: string
  count: number
}

interface AnalyticsEvent {
  inserted_at: string
  event_type: string
  actor_id: string | null
  payload: Record<string, unknown>
  context: Record<string, unknown>
}

interface FeedbackRow {
  id: string
  created_at: string
  user_id: string | null
  email: string | null
  q1_trying_to_do: string | null
  q2_blockers: string | null
  q3_indispensable: string | null
  page_context: string | null
}

interface ProfileRow {
  id: string
  display_name: string | null
  is_employee: boolean
  is_test_user: boolean
  created_at: string
}

interface ItemRow {
  id: string
  title: string
  created_at: string
  created_by: string
  organization_id: string
}

export interface AdminStatsResponse {
  generatedAt: string
  headline: HeadlineStats
  recentSignups: UserSignup[]
  funnel: FunnelStep[]
  feedback: FeedbackItem[]
  activityFeed: ActivityEvent[]
  errors: ErrorEvent[]
  topEventTypes: EventTypeSummary[]
  summary: {
    totalUsers: number
    totalOrganizations: number
    totalItems: number
    totalAnalyticsEvents: number
    totalFeedback: number
  }
}

export default defineEventHandler(async (event): Promise<AdminStatsResponse> => {
  const supabase = await serverSupabaseClient(event)
  await requireEmployee(event, supabase)

  const query = getQuery(event) as { includeTestUsers?: string }
  const includeTestUsers = query.includeTestUsers === 'true' || query.includeTestUsers === '1'

  const serviceClient = serverSupabaseServiceRole(event)
  // analytics schema isn't in the generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analyticsClient = (serviceClient as any).schema('analytics')

  // === Parallel fetch ===

  const [
    profilesResult,
    itemsResult,
    feedbackResult,
    analyticsEventsResult,
    orgsResult,
    authUsersResult
  ] = await Promise.all([
    serviceClient
      .from('profiles')
      .select('id, display_name, is_employee, is_test_user, created_at')
      .order('created_at', { ascending: false }),

    serviceClient
      .from('items')
      .select('id, title, created_at, created_by, organization_id')
      .order('created_at', { ascending: false }),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any)
      .from('feedback')
      .select('id, created_at, user_id, email, q1_trying_to_do, q2_blockers, q3_indispensable, page_context')
      .order('created_at', { ascending: false })
      .limit(50),

    analyticsClient
      .from('events')
      .select('inserted_at, event_type, actor_id, payload, context')
      .gte('inserted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('inserted_at', { ascending: false })
      .limit(500),

    serviceClient.from('organizations').select('id', { count: 'exact', head: true }),

    // Pull auth users to resolve emails (cosmo's profiles row has no email column).
    serviceClient.auth.admin.listUsers({ perPage: 1000 })
  ])

  const profiles = (profilesResult.data ?? []) as ProfileRow[]
  const items = (itemsResult.data ?? []) as ItemRow[]
  const feedbackRows = (feedbackResult.data ?? []) as FeedbackRow[]
  const analyticsEvents = (analyticsEventsResult.data ?? []) as AnalyticsEvent[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authUsers = (authUsersResult.data?.users ?? []) as Array<{ id: string, email?: string | null }>

  // Lookups
  const emailMap = new Map<string, string>()
  for (const u of authUsers) {
    if (u.id && u.email) emailMap.set(u.id, u.email)
  }
  const profileMap = new Map(profiles.map(p => [p.id, p]))

  // "Real users" = non-employees AND not test accounts.
  const realUserProfiles = profiles.filter(p => !p.is_employee && !p.is_test_user)
  const realUserIds = new Set(realUserProfiles.map(p => p.id))

  const recentSignupProfiles = profiles.filter((p) => {
    const isReal = !p.is_employee && !p.is_test_user
    const isTest = includeTestUsers && p.is_test_user
    return isReal || isTest
  })

  // === Headline ===

  const itemsByRealUser = items.filter(i => realUserIds.has(i.created_by))

  const eventsByUser = new Map<string, number>()
  for (const evt of analyticsEvents) {
    if (!evt.actor_id) continue
    eventsByUser.set(evt.actor_id, (eventsByUser.get(evt.actor_id) ?? 0) + 1)
  }

  // Active = logged at least one event in the last 7 days OR created an item.
  const itemCreatorIds = new Set(itemsByRealUser.map(i => i.created_by))
  const activeRealUserIds = new Set([
    ...Array.from(eventsByUser.entries())
      .filter(([uid, n]) => realUserIds.has(uid) && n > 0)
      .map(([uid]) => uid),
    ...Array.from(itemCreatorIds)
  ])

  const headline: HeadlineStats = {
    realUsers: realUserProfiles.length,
    activeUsers: activeRealUserIds.size,
    contentCreated: itemsByRealUser.length,
    activationRate: realUserProfiles.length > 0
      ? Math.round((activeRealUserIds.size / realUserProfiles.length) * 100)
      : 0
  }

  // === Recent signups ===

  const recentSignups: UserSignup[] = recentSignupProfiles.slice(0, 50).map((p) => {
    const userItems = items.filter(i => i.created_by === p.id).length
    const userEvents = eventsByUser.get(p.id) ?? 0

    let status: 'engaged' | 'started' | 'bounced'
    if (userItems > 0) {
      status = 'engaged'
    } else if (userEvents > 0) {
      status = 'started'
    } else {
      status = 'bounced'
    }

    return {
      id: p.id,
      email: emailMap.get(p.id) ?? null,
      displayName: p.display_name,
      signupDate: p.created_at,
      itemsCreated: userItems,
      eventsLogged: userEvents,
      isTestUser: p.is_test_user,
      status
    }
  })

  // === Funnel ===

  const signedUp = realUserProfiles.length
  const loggedAnEvent = realUserProfiles.filter(p => (eventsByUser.get(p.id) ?? 0) > 0).length
  const visitedApp = realUserProfiles.filter((p) => {
    return analyticsEvents.some(e => e.actor_id === p.id)
  }).length
  const createdItem = realUserProfiles.filter((p) => {
    return items.some(i => i.created_by === p.id)
  }).length

  const funnel: FunnelStep[] = [
    { name: 'Signed Up', count: signedUp, percentage: 100 },
    { name: 'Visited App', count: visitedApp, percentage: signedUp > 0 ? Math.round((visitedApp / signedUp) * 100) : 0 },
    { name: 'Logged Events', count: loggedAnEvent, percentage: signedUp > 0 ? Math.round((loggedAnEvent / signedUp) * 100) : 0 },
    { name: 'Created Content', count: createdItem, percentage: signedUp > 0 ? Math.round((createdItem / signedUp) * 100) : 0 }
  ]

  // === Feedback ===

  const feedback: FeedbackItem[] = feedbackRows.map((f) => {
    const profile = f.user_id ? profileMap.get(f.user_id) : null
    return {
      id: f.id,
      createdAt: f.created_at,
      email: (f.user_id ? emailMap.get(f.user_id) : null) ?? f.email ?? null,
      displayName: profile?.display_name ?? null,
      q1TryingToDo: f.q1_trying_to_do,
      q2Blockers: f.q2_blockers,
      q3Indispensable: f.q3_indispensable,
      pageContext: f.page_context
    }
  })

  // === Activity feed (real users only) ===

  const activityFeed: ActivityEvent[] = []
  for (const evt of analyticsEvents) {
    if (!evt.actor_id || !realUserIds.has(evt.actor_id)) continue
    const profile = profileMap.get(evt.actor_id)
    if (!profile) continue

    activityFeed.push({
      timestamp: evt.inserted_at,
      eventType: evt.event_type,
      userEmail: emailMap.get(evt.actor_id) ?? null,
      userName: profile.display_name,
      route: (evt.context as { route?: string })?.route ?? null
    })

    if (activityFeed.length >= 30) break
  }

  // === Errors ===

  const errors: ErrorEvent[] = []
  for (const evt of analyticsEvents) {
    if (!evt.event_type.includes('error') && !evt.event_type.includes('failed')) continue
    if (evt.actor_id && !realUserIds.has(evt.actor_id)) continue

    const payload = evt.payload as { errorMessage?: string, error?: string }

    errors.push({
      timestamp: evt.inserted_at,
      eventType: evt.event_type,
      errorMessage: payload?.errorMessage ?? payload?.error ?? 'Unknown error',
      userEmail: evt.actor_id ? (emailMap.get(evt.actor_id) ?? null) : null,
      route: (evt.context as { route?: string })?.route ?? null
    })

    if (errors.length >= 20) break
  }

  // === Event type breakdown (real users only) ===

  const eventCounts = new Map<string, number>()
  for (const evt of analyticsEvents) {
    if (!evt.actor_id || !realUserIds.has(evt.actor_id)) continue
    eventCounts.set(evt.event_type, (eventCounts.get(evt.event_type) ?? 0) + 1)
  }

  const topEventTypes: EventTypeSummary[] = Array.from(eventCounts.entries())
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  // === Legacy summary ===

  const summary = {
    totalUsers: profiles.length,
    totalOrganizations: orgsResult.count ?? 0,
    totalItems: items.length,
    totalAnalyticsEvents: analyticsEvents.length,
    totalFeedback: feedbackRows.length
  }

  return {
    generatedAt: new Date().toISOString(),
    headline,
    recentSignups,
    funnel,
    feedback,
    activityFeed,
    errors,
    topEventTypes,
    summary
  }
})
