<script setup lang="ts">
/**
 * Split auth shell (Camera Shy's, cosmo copy): brand + value props on the
 * left, the form on the right, login/signup toggle beside the color-mode
 * button. `AppLogo` is the single brand component.
 */
const route = useRoute()

const valueProps = [
  'Auth, orgs and billing wired on day one',
  'AI chat and editor through the Vercel AI Gateway',
  'Background jobs on Inngest, email on Resend',
  'Boots in demo mode with zero env'
]
</script>

<template>
  <!-- dvh, not vh: on iOS Safari the URL bar is part of the viewport height,
       so `min-h-screen` overflows by exactly the height of the chrome. -->
  <div class="min-h-dvh lg:grid lg:grid-cols-2">
    <!-- Left panel — brand -->
    <div class="hidden lg:flex flex-col bg-muted px-10 py-10">
      <NuxtLink to="/" class="flex items-center gap-2 font-bold text-highlighted">
        <AppLogo class="h-7" />
      </NuxtLink>

      <div class="flex flex-1 flex-col justify-center gap-6 max-w-md">
        <h2 class="text-2xl font-semibold text-highlighted text-balance">
          The starter every new project begins from.
        </h2>
        <ul class="flex flex-col gap-3">
          <li
            v-for="prop in valueProps"
            :key="prop"
            class="flex items-start gap-2.5 text-muted"
          >
            <UIcon name="i-lucide-check" class="mt-1 size-4 shrink-0 text-primary" />
            <span>{{ prop }}</span>
          </li>
        </ul>
      </div>

      <div class="flex h-10 items-end">
        <p class="text-sm text-muted">
          Cosmo &copy; {{ new Date().getFullYear() }}
        </p>
      </div>
    </div>

    <!-- Right panel — form -->
    <div class="flex flex-col min-h-dvh">
      <div class="flex items-center justify-between gap-3 px-6 py-6 lg:px-10 lg:py-10">
        <NuxtLink to="/" class="lg:hidden flex items-center gap-2 font-bold text-highlighted">
          <AppLogo class="h-6" />
        </NuxtLink>

        <div class="flex items-center gap-2 ml-auto">
          <ClientOnly>
            <UColorModeButton />
          </ClientOnly>
          <UButton
            v-if="route.path === '/auth/login'"
            to="/auth/signup"
            variant="ghost"
            color="neutral"
          >
            Sign up
          </UButton>
          <UButton
            v-else-if="route.path === '/auth/signup'"
            to="/auth/login"
            variant="ghost"
            color="neutral"
          >
            Log in
          </UButton>
        </div>
      </div>

      <div class="flex-1 flex items-center justify-center px-6 pb-10 lg:px-10 lg:pb-14">
        <div class="w-full max-w-sm">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>
