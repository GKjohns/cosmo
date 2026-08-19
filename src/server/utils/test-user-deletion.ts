import { createError } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Cascading delete for a test user. Cosmo's schema has fewer side-tables than
 * Margin's; the cascade is straightforward — items + memberships +
 * organizations they created + auth user.
 *
 * Adapted from Margin's `server/utils/test-user-deletion.ts`. Most CASCADE
 * paths are already in the cosmo migrations (`auth.users` → profiles, items,
 * memberships, ai_conversations, etc.) so this util mostly handles
 * organizations the test user created and any items in those orgs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteTestUserAndData(serviceClient: SupabaseClient<any, any, any>, testUserId: string): Promise<void> {
  // 1. Find organizations created by this user (cosmo's `organizations` has no
  // `created_by` column, so we resolve "owned" orgs as orgs where this user is
  // the only member or the earliest admin).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userMemberships } = await (serviceClient as any)
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', testUserId)

  const adminOrgIds: string[] = (userMemberships ?? [])
    .filter((m: { role?: string }) => m.role === 'admin')
    .map((m: { organization_id: string }) => m.organization_id)
    .filter(Boolean)

  // For each admin org, check whether the test user is the *only* member. If
  // so, delete the org (cascades members + items + invitations).
  for (const orgId of adminOrgIds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (serviceClient as any)
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)

    if ((count ?? 0) <= 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (serviceClient as any)
        .from('organizations')
        .delete()
        .eq('id', orgId)

      if (error && error.code !== '42P01') {
        console.error('[deleteTestUserAndData] Failed to delete solo organization', { orgId, error })
        throw createError({ statusCode: 500, statusMessage: 'Failed to clean up test user organization' })
      }
    }
  }

  // 2. Delete items the test user created in any org. (RLS would block this
  // for the test user themselves, but we're using service role, and the FK has
  // ON DELETE CASCADE from auth.users → items.created_by anyway. This is a
  // belt-and-suspenders pass for projects that loosen the FK.)
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (serviceClient as any)
      .from('items')
      .delete()
      .eq('created_by', testUserId)

    if (error && error.code !== '42P01') {
      console.error('[deleteTestUserAndData] Failed to delete items', error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to delete test user items' })
    }
  }

  // 3. Delete the auth user. CASCADE handles `profiles`, `memberships`,
  // `ai_conversations`, `ai_messages` per `001_initial.sql`. `feedback.user_id`
  // is `ON DELETE SET NULL` so feedback survives (which we want — anonymized
  // submissions stay around for the team to read).
  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(testUserId)
  if (deleteError) {
    console.error('[deleteTestUserAndData] Failed to delete auth user', deleteError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete test user' })
  }
}
