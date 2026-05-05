export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()

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
