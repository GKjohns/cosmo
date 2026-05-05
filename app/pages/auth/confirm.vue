<script setup lang="ts">
import { watchEffect } from 'vue'

definePageMeta({
  layout: 'auth',
  ssr: false
})

const route = useRoute()
const user = useSupabaseUser()

// Parse error information from query params or URL hash
const error = computed(() => route.query.error as string || route.hash.match(/error=([^&]+)/)?.[1])
const errorCode = computed(
  () => route.query.error_code as string || route.hash.match(/error_code=([^&]+)/)?.[1]
)
const errorDescription = computed(() => {
  const desc =
    (route.query.error_description as string) ||
    route.hash.match(/error_description=([^&]+)/)?.[1]

  return desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : ''
})

const supabase = useSupabaseClient()

onMounted(async () => {
  // Magic links (auth.admin.generateLink type=magiclink) return tokens in the
  // URL hash: #access_token=...&refresh_token=...&type=magiclink. The Supabase
  // client doesn't auto-pick these up on every redirect target, so we parse and
  // explicitly setSession.
  if (import.meta.client && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    if (accessToken && refreshToken) {
      const { error: setError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      })
      if (setError) {
        console.error('[auth/confirm] setSession from hash failed:', setError)
      }
    }
  }

  // PKCE flow (OAuth, email signup): exchange ?code= for a session.
  const code = route.query.code as string | undefined
  if (code && !user.value) {
    const { error: pkceError } = await supabase.auth.exchangeCodeForSession(code)
    if (pkceError) {
      console.error('PKCE exchange failed:', pkceError)
    }
  }
})

// When the user becomes authenticated, redirect. Precedence:
//   ?next= query (magic links pass this) → localStorage auth_redirect
//   (login form sets this) → /app.
watchEffect(() => {
  if (!user.value) {
    return
  }

  const nextParam = route.query.next as string | undefined
  if (nextParam && nextParam.startsWith('/')) {
    navigateTo(nextParam, { replace: true })
    return
  }

  if (import.meta.client) {
    const storedRedirect = localStorage.getItem('auth_redirect')
    if (storedRedirect) {
      localStorage.removeItem('auth_redirect')
      navigateTo(storedRedirect, { replace: true })
      return
    }
  }

  navigateTo('/app', { replace: true })
})
</script>

<template>
  <div class="w-full">
    <div class="max-w-sm w-full">
      <!-- Error state -->
      <UCard v-if="error" class="text-center" :ui="{ root: 'ring-0 shadow-none' }">
        <div class="flex items-center justify-center space-x-3">
          <UIcon name="i-heroicons-exclamation-circle" class="h-5 w-5 text-error" />

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
