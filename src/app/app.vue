<script setup lang="ts">
const colorMode = useColorMode()
const route = useRoute()

// Theme color tracks the brand bg in light mode, the slate-950 chrome in dark.
const themeColor = computed(() => colorMode.value === 'dark' ? '#09090B' : '#FFFFFF')
// Loading indicator picks up the accent so it stays visible against either bg.
const loadingIndicatorColor = computed(() => colorMode.value === 'dark' ? '#E2E8F0' : '#0F172A')

// Every crawler-facing absolute URL hangs off SITE.url (`app/utils/site.ts`).
// Trailing slashes are stripped so /app and /app/ don't advertise two
// canonicals.
const canonical = computed(() => SITE.url + (route.path === '/' ? '' : route.path.replace(/\/$/, '')))

// Icon and manifest links live in nuxt.config's app.head — one place, so the
// favicon isn't declared twice in the rendered <head>.
useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: themeColor }
  ],
  link: [
    { rel: 'canonical', href: canonical }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

useSeoMeta({
  title: SITE.name,
  titleTemplate: `%s · ${SITE.name}`,
  description: SITE.description,
  ogTitle: SITE.name,
  ogDescription: SITE.description,
  ogType: 'website',
  ogSiteName: SITE.name,
  ogUrl: canonical,
  ogImage: `${SITE.url}/og-image.png`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageType: 'image/png',
  ogImageAlt: SITE.name,
  twitterCard: 'summary_large_image'
})

const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('docs'), {
  transform: data => data.find(item => item.path === '/docs')?.children || []
})
const { data: files } = useLazyAsyncData('search', () => queryCollectionSearchSections('docs'), {
  server: false
})

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
        :links="navLinks"
        :fuse="{ resultLimit: 42 }"
      />
    </ClientOnly>
  </UApp>
</template>
