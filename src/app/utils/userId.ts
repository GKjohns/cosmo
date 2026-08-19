// Extracts the user id from a Supabase user object on the CLIENT.
//
// Why this exists: the Supabase user object surfaces its identifier as either
// `.id` (REST/session user) or `.sub` (JWT claim shape). Hand-rolling
// `(user as any)?.id || (user as any)?.sub` at every call site shipped a prod
// bug in Daylight when the shapes diverged. Centralized here with a narrow type
// so no `as any` is needed at call sites.
//
// Precedence note: client sites are id-first, then sub. The canonical SERVER
// helper (server/utils/auth.ts) is sub-first — do not "align" them.

type SupabaseUserLike = { id?: string | null, sub?: string | null } | null | undefined

export function userIdFromSupabaseUser(user: SupabaseUserLike): string | null {
  return user?.id ?? user?.sub ?? null
}
