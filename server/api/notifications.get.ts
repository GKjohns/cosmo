/**
 * GET /api/notifications — fake hardcoded data
 * TODO: Replace with Supabase query:
 * const { data } = await supabase.from('notifications').select('*, sender:profiles(*)').eq('user_id', userId)
 */
export default defineEventHandler(() => {
  return [
    {
      id: 1,
      unread: true,
      sender: { id: 2, name: 'Bob Martinez', email: 'bob@example.com', avatar: { src: '' }, status: 'subscribed', location: 'Austin, TX' },
      body: 'Assigned you to "Fix payment webhook idempotency"',
      date: '2026-04-12T09:15:00Z'
    },
    {
      id: 2,
      unread: true,
      sender: { id: 7, name: 'Grace Liu', email: 'grace@example.com', avatar: { src: '' }, status: 'subscribed', location: 'Chicago, IL' },
      body: 'Commented on "Deployment checklist"',
      date: '2026-04-11T17:30:00Z'
    },
    {
      id: 3,
      unread: false,
      sender: { id: 1, name: 'Alice Chen', email: 'alice@example.com', avatar: { src: '' }, status: 'subscribed', location: 'San Francisco, CA' },
      body: 'Created a new milestone "v2.1 Release"',
      date: '2026-04-10T10:00:00Z'
    }
  ]
})
