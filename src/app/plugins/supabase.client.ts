export default defineNuxtPlugin(async () => {
  if (!import.meta.client) return

  // DEMO MODE: no Supabase, no session to boot — the fixture user is implicit.
  if (useRuntimeConfig().public.demoMode) return

  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const session = useSupabaseSession()

  const { data: sessionData } = await supabase.auth.getSession()

  // Populate `useSupabaseUser()` BEFORE route middleware runs.
  //
  // Why: @nuxtjs/supabase v2 only fills the user state asynchronously (its
  // page:start hook / onAuthStateChange), and on CSR-only routes (/auth/confirm
  // is `ssr: false`) there is no SSR payload to hydrate from. So on a hard load
  // a logged-in user reads as logged-out in auth.global.ts and gets bounced to
  // /auth/login. This plugin is awaited and plugins run before middleware, so
  // filling the refs here closes that race.
  if (sessionData.session) {
    // The session ref matters as much as the user ref — the middleware's
    // `!user && !session` gate would false-negative on CSR routes without it.
    session.value = sessionData.session
  }

  if (sessionData.session && !user.value) {
    // auth-js RESOLVES with `{ data, error }` for auth/network failures (it
    // catches AuthError, including retryable fetch errors and 401s) and only
    // THROWS for non-auth exceptions — so inspect both paths.
    let failure: unknown = null
    try {
      const { data, error } = await supabase.auth.getClaims()
      if (error) failure = error
      else user.value = data?.claims ?? null
    } catch (err) {
      failure = err
    }

    if (failure) {
      // We hold a live session cookie but claims validation failed. Classify
      // instead of blindly failing closed:
      //  - auth-definitive (401 / revoked / missing session): the session is
      //    genuinely dead — sign out so the cookies clear and the gate fires
      //    cleanly, rather than stranding the visitor in a broken shell.
      //  - network-shaped: a transient hiccup. Leave the session ref populated
      //    so the middleware admits the visitor (every API route enforces auth
      //    independently) and let the module self-heal `user` moments later.
      const status = (failure as { status?: number })?.status
      const code = (failure as { code?: string })?.code
      const authDefinitive
        = status === 401
          || code === 'refresh_token_revoked'
          || code === 'session_not_found'

      if (authDefinitive) {
        session.value = null
        try {
          await supabase.auth.signOut()
        } catch {
          // Swallow — refs are already nulled, and a network failure here must
          // not reject this awaited boot plugin (that surfaces as a boot error).
        }
      }
    }
  }
})
