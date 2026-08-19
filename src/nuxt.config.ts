/**
 * Demo-first defaults: when Supabase env vars are missing, the @nuxtjs/supabase
 * module still needs *something* to boot. We feed it harmless dummies; every
 * server call site guards with `isSupabaseConfigured()` and short-circuits to
 * canned demo data before touching the network. See `server/utils/runtimeKeys.ts`.
 */
const DEMO_SUPABASE_URL = 'https://demo.supabase.invalid'
const DEMO_SUPABASE_ANON_KEY = 'demo-anon-key'

const supabaseUrl = process.env.SUPABASE_URL || DEMO_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || DEMO_SUPABASE_ANON_KEY
const isDemoMode = !process.env.SUPABASE_URL
  || !process.env.SUPABASE_ANON_KEY
  || !process.env.SUPABASE_SERVICE_ROLE_KEY

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/content',
    '@comark/nuxt',
    '@nuxtjs/supabase',
    '@vueuse/nuxt'
  ],

  devtools: {
    enabled: true
  },

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

  css: ['~/assets/css/main.css'],

  // Default to light. Users toggle via the color-mode button.
  colorMode: {
    preference: 'light',
    fallback: 'light'
  },

  // Content DB on `node:sqlite` (unflagged since Node 22.13; package.json
  // `engines` pins >=22.19 anyway) — no native `better-sqlite3` build step.
  content: {
    experimental: {
      sqliteConnector: 'native'
    }
  },

  // Nuxt UI 4.10: only bundle the components actually used in templates.
  // (`@nuxt/icon` is pinned to 2.3.1 in package.json: 2.4+ calls
  // `useRequestFetch().native`, which nitro 2.x doesn't expose, so every icon
  // outside the client bundle fails to SSR. Unpin once nuxt ships nitro 3.)
  ui: {
    experimental: {
      componentDetection: true
    }
  },

  runtimeConfig: {
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
      supabaseUrl: supabaseUrl,
      supabaseAnonKey: supabaseAnonKey,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      // Surfaces "no real keys" to the client so middleware / composables /
      // pages can short-circuit. Mirrors `isDemoMode()` on the server.
      demoMode: isDemoMode
    }
  },

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

  routeRules: {
    '/docs': { redirect: '/docs/getting-started' },
    '/api/**': { cors: true }
  },

  // Smooth the chat empty-state -> /app/chat/<id> handoff
  // (`[view-transition-name:chat-prompt]` on the prompt).
  experimental: {
    viewTransition: true
  },

  compatibilityDate: '2026-06-30',

  // No prerendering by default: `/` must be SSR (a CDN-cached anon landing +
  // client redirect breaks hydration for logged-in users) and the crawler turns
  // every dead link into a build failure. Opt into prerender per route with
  // `routeRules: { '/blog/**': { prerender: true } }` + `nitro.prerender.routes`
  // if a project wants static content pages.
  nitro: {
    // Bundle tslib helpers with the server for Vercel runtime.
    externals: {
      inline: ['tslib']
    }
  },

  // TipTap / ProseMirror must resolve to a single copy — a duplicated
  // `prosemirror-model` breaks `UEditor` + `@tiptap/extension-table` with
  // "Plugin/Fragment" instance errors. Same list as MonumentLabsSite.
  vite: {
    resolve: {
      dedupe: [
        '@tiptap/core',
        '@tiptap/pm',
        'prosemirror-state',
        'prosemirror-model',
        'prosemirror-view',
        'prosemirror-transform',
        'prosemirror-tables'
      ]
    },
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-model',
        '@nuxt/ui > prosemirror-view',
        '@nuxt/ui > prosemirror-transform',
        '@tiptap/extension-table',
        'prosemirror-tables'
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
  },

  // Cosmo owns auth routing in `app/middleware/auth.global.ts`.
  // `redirect: false` disables the module's auto-redirect, but the helpers
  // still consult `redirectOptions` — keep the two in sync.
  supabase: {
    url: supabaseUrl,
    key: supabaseAnonKey,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || DEMO_SUPABASE_ANON_KEY,
    redirect: false,
    // No `database.types.ts` in a template — clones generate one and point
    // `types` at it (see project_bootstrap.md).
    types: false,
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
  }
})
