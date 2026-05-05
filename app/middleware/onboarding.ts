/**
 * Route middleware: bounce a signed-in user with zero org memberships to
 * `/onboarding`. Apply on `/app/**` pages by setting
 * `definePageMeta({ middleware: ['onboarding'] })`.
 *
 * The dashboard layout drives this check; standalone routes that *should*
 * still work without an org (e.g. `/onboarding` itself, the invitation
 * accept page) opt out by simply not declaring this middleware.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const user = useSupabaseUser()
  if (!user.value) return

  // Don't loop on routes that need to remain accessible without an org.
  if (to.path.startsWith('/onboarding') || to.path.startsWith('/auth/')) return

  try {
    const ctx = await $fetch<{ organizations: Array<{ id: string }> }>('/api/app/organization-context')
    if ((ctx?.organizations?.length ?? 0) === 0) {
      return navigateTo('/onboarding')
    }
  }
  catch {
    // If the context endpoint is unreachable, let the page render.
    // (Server-side errors will surface elsewhere.)
  }
})
