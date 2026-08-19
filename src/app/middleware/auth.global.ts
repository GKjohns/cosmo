export default defineNuxtRouteMiddleware((to) => {
  // Let Nuxt 404 unmatched routes rather than bouncing them to login.
  if (!to.matched.length) return

  // DEMO MODE (no Supabase): every visitor is the fixture user. Skip the
  // gate, and walk the auth pages straight to /app so the form can't be
  // submitted into a dead module.
  if (useRuntimeConfig().public.demoMode) {
    if (to.path === '/auth/login' || to.path === '/auth/signup') {
      return navigateTo((to.query.redirect as string | undefined) || '/app')
    }
    return
  }

  // Auth callbacks can land on "/" instead of /auth/confirm: when Supabase
  // can't honor redirectTo (URL not on the allowlist) it falls back to the Site
  // URL and drops the tokens there. The root is public, so without this the
  // visitor just sees the landing page while the session establishes silently —
  // and only a *second* login lands them inside the app.
  if (to.path === '/' && import.meta.client) {
    const hash = to.hash || ''
    const isAuthCallback
      = hash.includes('access_token=')
        || hash.includes('refresh_token=')
        || hash.includes('type=magiclink')
        || !!to.query.code
        || !!to.query.error
        || !!to.query.error_description

    if (isAuthCallback) {
      return navigateTo({
        path: '/auth/confirm',
        query: { ...to.query },
        hash: to.hash
      }, { external: true })
    }
  }

  const user = useSupabaseUser()
  const session = useSupabaseSession()

  // Only /app/**, /internal/** and /onboarding are protected; the marketing
  // pages and /auth/** stay public. `/internal/**` gets a session gate here so
  // the employee middleware never has to 404 a signed-out visitor — it 404s
  // non-employees, which is a different (and deliberately silent) answer.
  //
  // Gate on `!user && !session`, not `!user` alone. A visitor holding a session
  // but no resolved user is admitted deliberately: on the server the module
  // refreshes expired tokens before middleware, so a null session genuinely
  // means "no usable cookies," while session-but-no-user is a transient claims
  // hiccup the boot plugin already classified. Admitting them is safe — every
  // API route enforces auth independently via requireUserId, so the worst case
  // is an empty shell, never leaked data.
  const isProtected = ['/app', '/internal', '/onboarding']
    .some(p => to.path === p || to.path.startsWith(p + '/'))

  if (!user.value && !session.value && isProtected) {
    return navigateTo(`/auth/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  // Authed users have no use for the auth pages or the marketing landing. This
  // branch requires a full `user`, so a session-but-no-user visitor can still
  // reach /auth/login to re-establish themselves.
  const isAuthLanding
    = to.path === '/auth/login'
      || to.path === '/auth/signup'
      || to.path === '/'

  if (user.value && isAuthLanding) {
    const redirect = to.query.redirect as string | undefined
    if (redirect) return navigateTo(redirect)
    return navigateTo('/app')
  }
})
