export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/content',
    '@vueuse/nuxt',
    'nuxt-og-image'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    inngestEventKey: process.env.INNGEST_EVENT_KEY,
    inngestSigningKey: process.env.INNGEST_SIGNING_KEY,

    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    }
  },

  routeRules: {
    '/docs': { redirect: '/docs/getting-started', prerender: false },
    '/api/**': { cors: true },
    '/app/**': { ssr: false }
  },

  compatibilityDate: '2024-07-11',

  nitro: {
    prerender: {
      routes: ['/'],
      crawlLinks: true
    }
  },

  vite: {
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-state'
      ]
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
