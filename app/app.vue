<script setup lang="ts">
const colorMode = useColorMode()

// Theme color tracks the brand bg in light mode, the slate-950 chrome in dark.
const themeColor = computed(() => colorMode.value === 'dark' ? '#09090B' : '#FFFFFF')
// Loading indicator picks up the accent so it stays visible against either bg.
const loadingIndicatorColor = computed(() => colorMode.value === 'dark' ? '#E2E8F0' : '#0F172A')

useHead({
  meta: [
    { key: 'theme-color', name: 'theme-color', content: themeColor }
  ]
})

useSeoMeta({
  // Smart title append: bare "Cosmo" stays as-is; everything else gets " | Cosmo".
  titleTemplate: (titleChunk?: string) => {
    if (!titleChunk || titleChunk === 'Cosmo') return 'Cosmo'
    return titleChunk.includes('Cosmo') ? titleChunk : `${titleChunk} | Cosmo`
  },
  twitterCard: 'summary_large_image'
})

const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('docs'), {
  transform: data => data.find(item => item.path === '/docs')?.children || []
})
const { data: files } = useLazyAsyncData('search', () => queryCollectionSearchSections('docs'), {
  server: false
})

const links = [{
  label: 'Docs',
  icon: 'i-lucide-book',
  to: '/docs/getting-started'
}, {
  label: 'Pricing',
  icon: 'i-lucide-credit-card',
  to: '/pricing'
}, {
  label: 'Blog',
  icon: 'i-lucide-pencil',
  to: '/blog'
}, {
  label: 'Changelog',
  icon: 'i-lucide-history',
  to: '/changelog'
}, {
  label: 'Help',
  icon: 'i-lucide-life-buoy',
  to: '/help'
}]

provide('navigation', navigation)
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator :color="loadingIndicatorColor" />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <ClientOnly>
      <LazyUContentSearch
        :files="files"
        shortcut="meta_k"
        :navigation="navigation"
        :links="links"
        :fuse="{ resultLimit: 42 }"
      />
    </ClientOnly>
  </UApp>
</template>
