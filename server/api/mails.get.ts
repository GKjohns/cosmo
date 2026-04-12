/**
 * GET /api/mails — fake hardcoded data
 * TODO: Replace with Supabase query:
 * const { data } = await supabase.from('messages').select('*, sender:profiles(*)').eq('organization_id', orgId)
 */
export default defineEventHandler(() => {
  return [
    {
      id: 1,
      unread: true,
      from: { id: 1, name: 'Alice Chen', email: 'alice@example.com', avatar: { src: '' }, status: 'subscribed', location: 'San Francisco, CA' },
      subject: 'Q2 planning kickoff',
      body: 'Hey team, wanted to get the Q2 planning started. I\'ve drafted some initial OKRs based on our retro. Can we schedule a sync this week to align on priorities? I think we should focus on the new onboarding flow and the API redesign.',
      date: '2026-04-12T08:30:00Z'
    },
    {
      id: 2,
      unread: true,
      from: { id: 2, name: 'Bob Martinez', email: 'bob@example.com', avatar: { src: '' }, status: 'subscribed', location: 'Austin, TX' },
      subject: 'Bug in payment processing',
      body: 'Found an edge case in the Stripe webhook handler — duplicate events aren\'t being deduplicated properly. I\'ve got a fix ready, just need a review. It\'s a one-liner in the idempotency check.',
      date: '2026-04-11T16:45:00Z'
    },
    {
      id: 3,
      unread: false,
      from: { id: 4, name: 'David Kim', email: 'david@example.com', avatar: { src: '' }, status: 'subscribed', location: 'Seattle, WA' },
      subject: 'Design review notes',
      body: 'Attached are my notes from the design review. Main feedback: the settings page needs better hierarchy, and the onboarding wizard could use a progress indicator. Otherwise looking great.',
      date: '2026-04-11T14:20:00Z'
    },
    {
      id: 4,
      unread: false,
      from: { id: 7, name: 'Grace Liu', email: 'grace@example.com', avatar: { src: '' }, status: 'subscribed', location: 'Chicago, IL' },
      subject: 'Deployment checklist',
      body: 'Before we ship v2.1, we need to: 1) Run the migration on staging, 2) Update the API docs, 3) Notify enterprise customers, 4) Update the changelog. I\'ll handle 1 and 2 if someone can take 3 and 4.',
      date: '2026-04-10T11:00:00Z'
    }
  ]
})
