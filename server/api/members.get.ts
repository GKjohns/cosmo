/**
 * GET /api/members — fake hardcoded data
 * TODO: Replace with Supabase query:
 * const { data } = await supabase.from('memberships').select('*, profiles(*)').eq('organization_id', orgId)
 */
export default defineEventHandler(() => {
  return [
    { name: 'Alice Chen', username: 'alice', role: 'owner', avatar: { src: '' } },
    { name: 'Bob Martinez', username: 'bob', role: 'member', avatar: { src: '' } },
    { name: 'David Kim', username: 'david', role: 'member', avatar: { src: '' } },
    { name: 'Grace Liu', username: 'grace', role: 'member', avatar: { src: '' } }
  ]
})
