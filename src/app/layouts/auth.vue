<template>
  <div class="min-h-screen bg-default text-default flex">
    <!-- Left side: brand + tagline -->
    <div
      class="hidden md:flex flex-1 flex-col justify-between border-default bg-elevated/40 px-10 py-8 rounded-none"
    >
      <NuxtLink to="/" class="flex items-center gap-2.5">
        <AppLogo class="h-7" />
      </NuxtLink>

      <p class="max-w-sm text-sm text-muted leading-relaxed">
        Nuxt 4 + Supabase + Inngest starter — clone it, customize it, ship.
      </p>
    </div>

    <!-- Right side: auth card -->
    <div class="flex-1 flex items-center justify-center px-4 py-10 relative">
      <!-- Mobile logo link in top left (hidden on md+) -->
      <NuxtLink to="/" class="md:hidden absolute top-4 left-4 flex items-center gap-2">
        <AppLogo class="h-6" />
      </NuxtLink>

      <!-- Color mode toggle in top right -->
      <ClientOnly>
        <div class="absolute top-4 right-4">
          <UColorModeButton />
        </div>
      </ClientOnly>

      <div class="w-full max-w-md">
        <slot />
      </div>
    </div>
  </div>
</template>
