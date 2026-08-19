export default defineNuxtPlugin(async () => {
  const supabase = useSupabaseClient()

  // Ensure session is initialized on client
  if (import.meta.client) {
    await supabase.auth.getSession()

    // Listen for auth changes; module syncs the session to cookies automatically.
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_redirect')
        }
      }
    })
  }
})
