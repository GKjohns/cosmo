export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/content',
    '@nuxtjs/supabase',
    '@vueuse/nuxt',
    'nuxt-og-image'
  ],

  // Cosmo owns auth routing in `app/middleware/auth.global.ts`.
  // `redirect: false` disables the module's auto-redirect, but the helpers
  // still consult `redirectOptions` — keep the two in sync.
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    redirect: false,
    redirectOptions: {
      login: '/auth/login',
      callback: '/auth/confirm',
      exclude: ['/', '/pricing', '/blog/**', '/docs/**', '/changelog/**']
    },
    cookieOptions: {
      maxAge: 60 * 60 * 8,
      sameSite: 'lax',
      secure: !import.meta.dev
    },
    clientOptions: {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    }
  },

  devtools: {
    enabled: true
  },

  // Default to light. Users toggle via the color-mode button.
  colorMode: {
    preference: 'light',
    fallback: 'light'
  },

  css: ['~/assets/css/main.css'],

  /*
   * Head meta — placeholders templated as {{TITLE}} / {{DESCRIPTION}} / {{URL}}.
   * Projects search-and-replace these on bootstrap (see
   * `~/claude-ops/conventions/project_bootstrap.md`).
   */
  app: {
    head: {
      htmlAttrs: {
        lang: 'en'
      },
      title: 'Cosmo',
      link: [
        { rel: 'icon', href: '/favicon.ico' }
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },

        // Basic SEO
        { name: 'description', content: '{{DESCRIPTION}}' },
        { name: 'author', content: '{{TITLE}}' },
        { name: 'robots', content: 'index, follow' },

        // Open Graph
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: '{{TITLE}}' },
        { property: 'og:title', content: '{{TITLE}}' },
        { property: 'og:description', content: '{{DESCRIPTION}}' },
        { property: 'og:locale', content: 'en_US' },
        { property: 'og:url', content: '{{URL}}' },

        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: '{{TITLE}}' },
        { name: 'twitter:description', content: '{{DESCRIPTION}}' },

        // App-specific
        { name: 'application-name', content: '{{TITLE}}' },
        { name: 'apple-mobile-web-app-title', content: '{{TITLE}}' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'format-detection', content: 'telephone=no' }
      ],
      script: [
        // Schema.org structured data — fill placeholders on project bootstrap.
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            'name': '{{TITLE}}',
            'url': '{{URL}}',
            'applicationCategory': 'BusinessApplication',
            'operatingSystem': 'Web',
            'description': '{{DESCRIPTION}}',
            'offers': {
              '@type': 'Offer',
              'price': '0',
              'priceCurrency': 'USD'
            },
            'publisher': {
              '@type': 'Organization',
              'name': '{{TITLE}}',
              'url': '{{URL}}'
            }
          })
        }
      ]
    }
  },

  runtimeConfig: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    inngestEventKey: process.env.INNGEST_EVENT_KEY,
    inngestSigningKey: process.env.INNGEST_SIGNING_KEY,

    // Resend / email layer
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
    resendAlertFrom: process.env.RESEND_ALERT_FROM,
    resendAlertTo: process.env.RESEND_ALERT_TO,
    resendAllowSend: process.env.RESEND_ALLOW_SEND,

    // Stripe — leave empty to run in stub mode. `isStripeConfigured()`
    // checks `process.env.STRIPE_SECRET_KEY` directly (works in workers too).
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    stripePriceId: process.env.STRIPE_PRICE_ID,

    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    }
  },

  routeRules: {
    '/docs': { redirect: '/docs/getting-started', prerender: false },
    '/api/**': { cors: true }
  },

  compatibilityDate: '2024-07-11',

  // Ensure Supabase modules are transpiled correctly for ESM / prerender.
  build: {
    transpile: [
      '@supabase/supabase-js',
      '@supabase/auth-js',
      '@supabase/functions-js',
      '@supabase/postgrest-js',
      '@supabase/realtime-js',
      '@supabase/storage-js'
    ]
  },

  nitro: {
    prerender: {
      routes: ['/'],
      crawlLinks: true
    },
    // Bundle tslib helpers with the server for Vercel runtime.
    externals: {
      inline: ['tslib']
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
