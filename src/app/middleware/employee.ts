/**
 * Page middleware: blocks anyone who is not an employee.
 *
 * The check is purely DB-driven via `profiles.is_employee` — no NODE_ENV
 * bypass, no client-side flag.
 *
 * Returns 404 (not a redirect) when the caller is signed in but not an
 * employee, so the existence of internal-only routes is not advertised.
 * Unauthed users follow the normal `/auth/login` redirect.
 *
 * Apply to pages with: definePageMeta({ middleware: 'employee' })
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  if (!user.value) {
    return navigateTo(`/auth/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  try {
    const response = await $fetch<{ profile?: { is_employee?: boolean } | null }>('/api/app/profile', {
      headers: useRequestHeaders(['cookie'])
    })

    if (response?.profile?.is_employee !== true) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })
    }
  }
  catch (err: any) {
    if (err?.statusCode === 404) throw err
    throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })
  }
})
