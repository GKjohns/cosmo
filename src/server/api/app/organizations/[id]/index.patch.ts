import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'

const schema = z.object({
  name: z.string().trim().min(2, 'Name is too short.').max(100, 'Name is too long.')
})

/**
 * Rename an organization. Admin-only.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const orgId = getRouterParam(event, 'id')

  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: 'Organization ID is required.' })
  }

  const admin = serverSupabaseAdmin()
  const membership = await requireOrgMember(event, admin, orgId, userId)

  if (membership.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can update the organization.' })
  }

  const body = await readValidatedBody(event, schema.parse)
  const slug = body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  const { data: org, error } = await admin
    .from('organizations')
    .update({ name: body.name, slug })
    .eq('id', orgId)
    .select('id, name, slug, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'An organization with that name already exists.' })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { organization: org }
})
