import * as z from 'zod'
import { serverSupabaseClient } from '#supabase/server'

const updateProfileSchema = z.object({
  display_name: z.string().trim().min(2).max(120).optional(),
  title: z.string().trim().max(120).nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  current_focus: z.string().trim().max(160).nullable().optional(),
  is_technical: z.boolean().optional(),
  ai_context: z.string().trim().max(1200).nullable().optional(),
  timezone: z.string().trim().max(80).nullable().optional(),
  avatar_url: z.string().trim().url().max(1024).nullable().optional()
})

function normalizeSkills(skills?: string[]): string[] {
  if (!skills) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of skills) {
    const trimmed = s.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

/**
 * Update the calling user's profile.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)
  const body = await readBody(event)
  const parsed = updateProfileSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile update.' })
  }

  const admin = serverSupabaseAdmin()
  const payload = parsed.data
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }

  if (payload.display_name !== undefined) updates.display_name = payload.display_name
  if (payload.title !== undefined) updates.title = payload.title?.toString().trim() || null
  if (payload.skills !== undefined) updates.skills = normalizeSkills(payload.skills)
  if (payload.current_focus !== undefined) updates.current_focus = payload.current_focus?.toString().trim() || null
  if (payload.is_technical !== undefined) updates.is_technical = payload.is_technical
  if (payload.ai_context !== undefined) updates.ai_context = payload.ai_context?.toString().trim() || null
  if (payload.timezone !== undefined) updates.timezone = payload.timezone || null
  if (payload.avatar_url !== undefined) updates.avatar_url = payload.avatar_url || null

  const { data, error } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id, display_name, avatar_url, timezone, is_employee, is_test_user, current_focus, title, skills, is_technical, ai_context, created_at, updated_at')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { profile: data }
})
