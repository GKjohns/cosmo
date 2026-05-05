<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
  layout: 'auth'
})

useSeoMeta({
  title: 'Sign in',
  description: 'Sign in to your Cosmo account.'
})

const state = reactive({
  email: '',
  password: ''
})

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const route = useRoute()
const loading = ref(false)
const formError = ref<string | null>(null)
const showEmailForm = ref(false)
const initialEmail = ref('')
const emailInputRef = ref<any | null>(null)

async function expandEmailForm() {
  showEmailForm.value = true
  state.email = initialEmail.value

  await nextTick()
  const component = emailInputRef.value as any
  const el =
    component?.$el?.querySelector?.('input') ||
    component?.$el ||
    component

  if (el && typeof el.focus === 'function') {
    el.focus()
    if (typeof el.setSelectionRange === 'function') {
      const length = el.value?.length ?? 0
      el.setSelectionRange(length, length)
    }
  }
}

type Schema = typeof state

function validate(current: Partial<Schema>): FormError[] {
  const errors: FormError[] = []

  if (!current.email) {
    errors.push({ name: 'email', message: 'Email is required' })
  }

  if (!current.password) {
    errors.push({ name: 'password', message: 'Password is required' })
  }

  return errors
}

async function onSubmit(_event: FormSubmitEvent<Schema>) {
  try {
    loading.value = true
    formError.value = null

    const { error } = await supabase.auth.signInWithPassword({
      email: state.email,
      password: state.password
    })

    if (error) {
      formError.value = error.message
      return
    }

    const redirect = (route.query.redirect as string | undefined) || '/app'
    await router.push(redirect)
  } catch (error: any) {
    formError.value = error?.message || 'Unable to sign in. Please try again.'
  } finally {
    loading.value = false
  }
}

async function signInWithGoogle() {
  try {
    loading.value = true
    formError.value = null

    if (import.meta.client) {
      const redirect =
        (route.query.redirect as string | undefined) ||
        localStorage.getItem('auth_redirect') ||
        '/app'
      localStorage.setItem('auth_redirect', redirect)
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/confirm`
      }
    })

    if (error) {
      console.error('Google sign-in error:', error)
      formError.value = error.message
    }
  } catch (error: any) {
    console.error('Unexpected error:', error)
    formError.value = error?.message || 'Unable to sign in with Google.'
  } finally {
    loading.value = false
  }
}

watchEffect(() => {
  if (user.value) {
    const redirect = (route.query.redirect as string | undefined) || '/app'
    router.replace(redirect)
  }
})
</script>

<template>
  <UCard>
    <div class="space-y-6">
      <div class="space-y-1 text-center">
        <h1 class="text-xl font-semibold text-highlighted">
          Welcome back
        </h1>
        <p class="text-sm text-muted">
          Sign in to continue to Cosmo.
        </p>
      </div>

      <!-- Initial compact email input -->
      <div v-if="!showEmailForm" class="relative">
        <UIcon name="i-lucide-mail" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted size-4" />
        <input
          v-model="initialEmail"
          type="email"
          placeholder="Email"
          class="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-default bg-default text-highlighted placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary hover:ring-2 hover:ring-primary/50 cursor-pointer transition-shadow"
          @focus="expandEmailForm"
        >
      </div>

      <!-- Expanded email form -->
      <UForm
        v-else
        :state="state"
        :validate="validate"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UAlert
          v-if="formError"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :title="formError"
        />

        <UFormField label="Email" name="email" required>
          <UInput
            ref="emailInputRef"
            v-model="state.email"
            type="email"
            placeholder="name@example.com"
            color="neutral"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Password" name="password" required>
          <UInput
            v-model="state.password"
            type="password"
            placeholder="••••••••"
            color="neutral"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          color="primary"
          block
          class="mt-2"
          :loading="loading"
        >
          Sign in with Email
        </UButton>
      </UForm>

      <div class="relative">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-default" />
        </div>
        <div class="relative flex justify-center text-xs text-muted">
          <span class="bg-default px-2">Or continue with</span>
        </div>
      </div>

      <UButton
        color="neutral"
        variant="outline"
        block
        icon="i-simple-icons-google"
        :loading="loading"
        @click="signInWithGoogle"
      >
        Continue with Google
      </UButton>

      <p class="text-sm text-muted text-center">
        Don't have an account?
        <NuxtLink to="/auth/signup" class="font-medium text-highlighted hover:underline">
          Sign up
        </NuxtLink>
      </p>
    </div>
  </UCard>
</template>
