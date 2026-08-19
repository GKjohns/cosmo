/**
 * Tiny helper for "is cosmo running without real Supabase keys?".
 *
 * Mirrors `isDemoMode()` on the server. Pages, composables, and components
 * read this to short-circuit auth flows and render demo banners.
 */
export function useDemoMode() {
  const { demoMode } = useRuntimeConfig().public
  return computed(() => Boolean(demoMode))
}
