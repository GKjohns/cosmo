import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'

const schema = z.object({
  name: z.string().min(2).max(100)
})

/**
 * Create a new organization. The caller becomes its first admin.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const body = await readValidatedBody(event, schema.parse)
  const admin = serverSupabaseAdmin()

  const baseSlug = body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Ensure slug uniqueness with a short random suffix on collision.
  let slug = baseSlug
  for (let i = 0; i < 3; i++) {
    const { data: existing } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!existing) break
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
  }

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: body.name, slug })
    .select('id, name, slug, created_at')
    .single()

  if (orgError) {
    if (orgError.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'An organization with that name already exists.' })
    }
    throw createError({ statusCode: 500, statusMessage: orgError.message })
  }

  const { error: memberError } = await admin
    .from('memberships')
    .insert({
      user_id: userId,
      organization_id: org.id,
      role: 'admin'
    })

  if (memberError) {
    throw createError({ statusCode: 500, statusMessage: memberError.message })
  }

  return { organization: org }
})
