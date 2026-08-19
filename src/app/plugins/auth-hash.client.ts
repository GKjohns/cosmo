/**
 * Consume Supabase auth tokens from the URL hash, regardless of which page they
 * land on.
 *
 * Why this exists: Supabase's verify endpoint redirects with
 * `#access_token=…&refresh_token=…` appended to the redirect URL. We always ask
 * for /auth/confirm, but if a link's redirect target isn't on the project's
 * allowlist Supabase silently falls back to the Site URL — a page with no
 * hash-handling logic, so the tokens sit unused and the click appears to do
 * nothing. This catches them anywhere.
 *
 * Short-circuits immediately when there's no auth hash (the common case).
 */
export default defineNuxtPlugin(async () => {
  if (typeof window === 'undefined') return
  if (!window.location.hash) return

  const hashParams = new URLSearchParams(window.location.hash.substring(1))
  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')
  if (!accessToken || !refreshToken) return

  const supabase = useSupabaseClient()

  // Sign out FIRST — without this the previous user's cookies persist and SSR
  // keeps rendering as them even after setSession. Local scope only, so other
  // tabs aren't kicked (Supabase's default sign-out scope is global).
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch (err) {
    console.warn('[auth-hash] signOut before setSession failed:', err)
  }

  const { error: setError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  })
  if (setError) {
    console.error('[auth-hash] setSession from hash failed:', setError)
    return
  }

  // Strip the hash so a refresh doesn't re-process a token Supabase already
  // invalidated on first use.
  const url = new URL(window.location.href)
  url.hash = ''
  window.history.replaceState({}, '', url.toString())

  // The page was server-rendered under the previous session's cookies, so the
  // fetched data is stale. Reload rather than show the old user's content.
  window.location.reload()
})
