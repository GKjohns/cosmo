<script setup lang="ts">
definePageMeta({
  layout: 'auth',
  // CSR-only: the tokens live in the URL hash, which never reaches the server.
  ssr: false
})

useSeoMeta({
  title: 'Confirming',
  description: 'Confirming your authentication'
})

const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()

// Not every failure comes back as an error param. A dead PKCE exchange returns
// a clean URL, so without this the page spins on "Confirming…" forever — which
// is the common real path: sign up on desktop, click the link on your phone.
const localError = ref('')

// Failures arrive either as query params or hash fragments depending on where
// in the flow Supabase gave up, so read both.
const error = computed(
  () => route.query.error as string || route.hash.match(/error=([^&]+)/)?.[1] || localError.value
)
const errorCode = computed(
  () => route.query.error_code as string || route.hash.match(/error_code=([^&]+)/)?.[1]
)
const errorDescription = computed(() => {
  const desc
    = (route.query.error_description as string)
      || route.hash.match(/error_description=([^&]+)/)?.[1]

  return desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : localError.value
})

onMounted(async () => {
  // Two shapes land here. Magic links / email confirmations return tokens in
  // the hash; the client doesn't auto-consume those on every redirect target,
  // so parse and setSession explicitly.
  let sessionFromHash = false
  if (window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    if (accessToken && refreshToken) {
      const { error: setError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      })
      if (setError) {
        if (import.meta.dev) {
          console.warn('[auth/confirm] setSession from hash failed (non-fatal):', setError)
        }
      } else {
        sessionFromHash = true
      }
    }
  }

  // PKCE (OAuth, signup confirm): exchange ?code= for a session. Skipped on the
  // hash happy path, where there is no code verifier and the exchange would
  // only throw a noisy non-fatal error.
  const code = route.query.code as string | undefined
  if (code && !sessionFromHash && !user.value) {
    const { error: pkceError } = await supabase.auth.exchangeCodeForSession(code)
    if (pkceError) {
      localError.value = 'This confirmation link has expired or was opened in a different browser. Log in to continue.'
      if (import.meta.dev) {
        console.warn('[auth/confirm] PKCE code exchange failed:', pkceError)
      }
    }
  }

  // Nothing to consume and nobody signed in — a bare visit or a mangled link.
  if (!sessionFromHash && !code && !user.value) {
    localError.value = 'That confirmation link is incomplete. Log in to continue.'
  }
})

// When the user becomes authenticated, redirect. `?redirect=` is the single
// param (magic links and the login page both pass it); the localStorage stash
// is written only by the Google OAuth button, whose round-trip can't carry a
// query — so it is read here and cleared.
let hasNavigated = false
watchEffect(() => {
  if (!user.value || hasNavigated) return
  hasNavigated = true

  const stored = localStorage.getItem('auth_redirect')
  if (stored) localStorage.removeItem('auth_redirect')

  const redirect = (route.query.redirect as string | undefined) || stored || '/app'
  navigateTo(redirect.startsWith('/') ? redirect : '/app', { replace: true })
})
</script>

<template>
  <div class="w-full">
    <div class="max-w-sm w-full">
      <!-- Error state -->
      <UCard v-if="error" class="text-center" :ui="{ root: 'ring-0 shadow-none' }">
        <div class="flex items-center justify-center space-x-3">
          <UIcon name="i-lucide-circle-alert" class="h-5 w-5 text-error" />

          <div class="text-left flex-1">
            <p class="text-sm font-medium text-highlighted">
              Authentication failed
            </p>
            <p class="text-xs text-muted">
              {{ errorDescription || errorCode || 'Please try again.' }}
            </p>
          </div>

          <UButton
            to="/auth/login"
            variant="ghost"
            size="xs"
            color="neutral"
          >
            Back
          </UButton>
        </div>
      </UCard>

      <!-- Loading state -->
      <UCard v-else class="text-center" :ui="{ root: 'ring-0 shadow-none' }">
        <div class="flex items-center justify-center space-x-3">
          <svg
            class="animate-spin h-5 w-5 text-primary"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0
              3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>

          <p class="text-sm text-muted">
            Confirming authentication...
          </p>
        </div>
      </UCard>
    </div>
  </div>
</template>
