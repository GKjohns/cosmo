/**
 * GET /api/customers — fake hardcoded data
 * TODO: Replace with Supabase query:
 * const { data } = await supabase.from('customers').select('*').eq('organization_id', orgId)
 */
export default defineEventHandler(() => {
  return [
    { id: 1, name: 'Alice Chen', email: 'alice@example.com', avatar: { src: '' }, status: 'subscribed', location: 'San Francisco, CA' },
    { id: 2, name: 'Bob Martinez', email: 'bob@example.com', avatar: { src: '' }, status: 'subscribed', location: 'Austin, TX' },
    { id: 3, name: 'Carol Johnson', email: 'carol@example.com', avatar: { src: '' }, status: 'unsubscribed', location: 'New York, NY' },
    { id: 4, name: 'David Kim', email: 'david@example.com', avatar: { src: '' }, status: 'subscribed', location: 'Seattle, WA' },
    { id: 5, name: 'Eva Nguyen', email: 'eva@example.com', avatar: { src: '' }, status: 'bounced', location: 'Portland, OR' },
    { id: 6, name: 'Frank Wilson', email: 'frank@example.com', avatar: { src: '' }, status: 'subscribed', location: 'Denver, CO' },
    { id: 7, name: 'Grace Liu', email: 'grace@example.com', avatar: { src: '' }, status: 'subscribed', location: 'Chicago, IL' },
    { id: 8, name: 'Henry Park', email: 'henry@example.com', avatar: { src: '' }, status: 'subscribed', location: 'Boston, MA' }
  ]
})
