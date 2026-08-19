/**
 * Page-level employee gate for `/internal/**`.
 *
 * **404, never 403** — same rule as `server/utils/requireEmployee.ts`. A
 * non-employee who guesses the URL gets the ordinary Nuxt error page, which is
 * indistinguishable from the route not existing.
 *
 * The signed-out case never reaches here: `auth.global.ts` bounces a visitor
 * with no session to `/auth/login?redirect=…` first, and global middleware runs
 * before named middleware. So "signed in, not an employee" is the only case
 * this file answers, and silence is the right answer to it.
 */
export default defineNuxtRouteMiddleware(async () => {
  // One profile endpoint (`/api/app/profile`), fetched once per boot: the SSR
  // answer rides the payload, so the client hydrates without a second request.
  const { profile, isFetched, fetchProfile } = useProfile()
  if (!isFetched.value) await fetchProfile()

  if (profile.value?.is_employee !== true) {
    return abortNavigation(createError({
      statusCode: 404,
      statusMessage: 'Page not found',
      fatal: true
    }))
  }
})
