export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  const { demoMode } = useRuntimeConfig().public
  const isDemo = Boolean(demoMode)

  // Let Nuxt 404 unmatched routes
  if (!to.matched.length) return

  const publicRoutes = [
    '/',
    '/pricing',
    '/blog',
    '/docs',
    '/changelog',
    '/help',
    '/auth/login',
    '/auth/signup',
    '/auth/confirm'
  ]

  const isPublic = publicRoutes.some(route =>
    to.path === route || to.path.startsWith(route + '/')
  )

  // Demo mode → no Supabase configured. Treat every visitor as the fixture
  // demo user: skip the unauthed-bounce, and short-circuit the auth pages
  // straight to /app so the form can't be submitted into a dead module.
  if (isDemo) {
    const isAuthLanding = to.path === '/auth/login' || to.path === '/auth/signup'
    if (isAuthLanding) {
      const redirect = to.query.redirect as string
      return navigateTo(redirect || '/app')
    }
    return
  }

  // Unauthed → bounce protected routes to login (preserving intended destination)
  if (!user.value && !isPublic) {
    return navigateTo(`/auth/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  // Authed → bounce away from auth pages.
  const isAuthLanding =
    to.path === '/auth/login' ||
    to.path === '/auth/signup'

  if (user.value && isAuthLanding) {
    const redirect = to.query.redirect as string
    if (redirect) return navigateTo(redirect)
    return navigateTo('/app')
  }
})
