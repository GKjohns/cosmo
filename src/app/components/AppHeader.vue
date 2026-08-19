<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

const route = useRoute()

const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const { open: searchOpen } = useContentSearch()

const open = ref(false)

const isDocs = computed(() => route.path === '/docs' || route.path.startsWith('/docs/'))

// Both modals portal to `body` with no z-index, so after a client-side layout
// change the menu can end up painted over the search
watch(searchOpen, (value) => {
  if (value) {
    open.value = false
  }
})

const items = computed(() => [{
  label: 'Docs',
  to: '/docs',
  active: isDocs.value
}, {
  label: 'Pricing',
  to: '/pricing'
}, {
  label: 'Blog',
  to: '/blog'
}, {
  label: 'Changelog',
  to: '/changelog'
}, {
  label: 'Help',
  to: '/help'
}])
</script>

<template>
  <UHeader v-model:open="open">
    <template #left>
      <NuxtLink to="/">
        <AppLogo class="w-auto h-6 shrink-0" />
      </NuxtLink>
    </template>

    <UNavigationMenu
      :items="items"
      variant="link"
    />

    <template #right>
      <UColorModeButton />

      <UContentSearchButton class="lg:hidden" />

      <UButton
        icon="i-lucide-log-in"
        color="neutral"
        variant="ghost"
        to="/auth/login"
        class="lg:hidden"
      />

      <UButton
        label="Sign in"
        color="neutral"
        variant="outline"
        to="/auth/login"
        class="hidden lg:inline-flex"
      />

      <UButton
        label="Request access"
        color="neutral"
        trailing-icon="i-lucide-arrow-right"
        class="hidden lg:inline-flex"
        to="/auth/signup"
      />
    </template>

    <template #body>
      <UNavigationMenu
        :items="items"
        orientation="vertical"
        class="-mx-2.5"
      />

      <template v-if="isDocs">
        <USeparator class="my-6" />

        <UContentNavigation
          :navigation="navigation"
          highlight
        />
      </template>

      <USeparator class="my-6" />

      <UButton
        label="Sign in"
        color="neutral"
        variant="subtle"
        to="/auth/login"
        block
        class="mb-3"
      />
      <UButton
        label="Request access"
        color="neutral"
        to="/auth/signup"
        block
      />
    </template>
  </UHeader>
</template>
