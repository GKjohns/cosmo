import { SITE } from './app/utils/site'

/**
 * Demo-first defaults: when Supabase env vars are missing, the @nuxtjs/supabase
 * module still needs *something* to boot. We feed it harmless dummies; every
 * server call site guards with `isSupabaseConfigured()` and short-circuits to
 * canned demo data before touching the network. See `server/utils/runtimeKeys.ts`.
 *
 * Env names are the fleet's (`SUPABASE_URL` / `SUPABASE_KEY` /
 * `SUPABASE_SECRET_KEY`). The legacy `SUPABASE_ANON_KEY` /
 * `SUPABASE_SERVICE_ROLE_KEY` pair is still honored — the Vercel↔Supabase
 * integration and copied sibling `.env`s inject them — via the same fallback
 * chain `runtimeKeys.ts` uses, so the module and `isDemoMode()` can never
 * disagree. `server/plugins/boot-banner.ts` prints a one-line rename warning.
 */
const DEMO_SUPABASE_URL = 'https://demo.supabase.invalid'
const DEMO_SUPABASE_KEY = 'demo-anon-key'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
const isDemoMode = !supabaseUrl || !supabaseKey || !supabaseSecretKey

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    // Must load before @nuxt/content so the collection integration
    // (`defineSitemapSchema()` in content.config.ts) picks up blog/docs slugs.
    '@nuxtjs/sitemap',
    '@nuxt/content',
    '@comark/nuxt',
    '@nuxtjs/supabase',
    // Vercel Web Analytics — client-only plugin that injects Vercel's script
    // and renders nothing. The Nuxt module lives at the `/nuxt` subpath; the
    // bare `@vercel/analytics` id is the plain JS SDK, not a Nuxt module.
    '@vercel/analytics/nuxt',
    '@vueuse/nuxt'
  ],

  devtools: {
    enabled: true
  },

  // Icon and manifest links are declared here and nowhere else — the rest of
  // the head (charset/viewport/theme-color/canonical + the SEO meta block)
  // lives in `app/app.vue`. Brand name/description/url: `app/utils/site.ts`.
  app: {
    head: {
      htmlAttrs: {
        lang: 'en'
      },
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  // Feeds @nuxtjs/sitemap (absolute URLs) and nuxt-site-config.
  site: {
    url: SITE.url,
    name: SITE.name
  },

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

    // Dev-tools test users get `test+<ts>@<domain>` addresses. Default is a
    // non-routable TLD so nothing can ever bounce off a real mailbox.
    testUserEmailDomain: process.env.TEST_USER_EMAIL_DOMAIN || 'cosmo.test',

    public: {
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      // Surfaces "no real keys" to the client so middleware / composables /
      // pages can short-circuit. Mirrors `isDemoMode()` on the server.
      demoMode: isDemoMode
    }
  },

  // The Supabase packages ship ESM that Nitro's prerender/build step chokes on
  // unless transpiled.
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

  // Crawler hygiene for surfaces robots.txt can't fully cover. robots.txt only
  // asks politely; these headers make the private surfaces non-indexable even
  // when a URL leaks via a shared link or referrer. /internal is deliberately
  // absent from robots.txt (a Disallow line would advertise the path), so this
  // header is its only crawler signal. /auth/confirm carries single-use magic
  // link codes — a cached copy in an index is a burned login link.
  routeRules: {
    '/docs': { redirect: '/docs/getting-started' },
    // `/x/**` does not match `/x` itself, hence each pair.
    '/app': { headers: { 'X-Robots-Tag': 'noindex' } },
    '/app/**': { headers: { 'X-Robots-Tag': 'noindex' } },
    '/internal': { headers: { 'X-Robots-Tag': 'noindex' } },
    '/internal/**': { headers: { 'X-Robots-Tag': 'noindex' } },
    '/auth/confirm': { headers: { 'X-Robots-Tag': 'noindex' } },
    '/api/**': { cors: true }
  },

  experimental: {
    // Smooth the chat empty-state -> /app/chat/<id> handoff
    // (`[view-transition-name:chat-prompt]` on the prompt).
    viewTransition: true,
    // A stale chunk after a deploy reloads the page instead of white-screening.
    emitRouteChunkError: 'automatic-immediate'
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
    },

    // Nitro deploys the whole server as one Vercel function, so this
    // maxDuration is the ceiling for every API route (a ceiling, not a
    // reservation — cost accrues on real duration). The AI routes run past
    // the 10s default. Vercel clamps this to the plan max if lower.
    vercel: {
      functions: {
        maxDuration: 60
      }
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

  // `@iconify-json/lucide` (+ simple-icons, vscode-icons for Nuxt UI's docs
  // code blocks) are installed, so every icon we use resolves locally. Without
  // this, Nuxt Icon still fetches anything outside the client bundle from
  // api.iconify.design — a third-party request on page load, seen in prod.
  icon: {
    fallbackToApi: false
  },

  // Private surfaces never belong in the sitemap; the noindex headers above
  // are the belt, this is the suspenders.
  sitemap: {
    exclude: ['/app/**', '/auth/**', '/onboarding', '/internal/**']
  },

  // Auth. `redirect: false` because the module's built-in guard can't express
  // "only /app/** is protected" — app/middleware/auth.global.ts owns routing
  // (protected prefixes `/app`, `/internal`, `/onboarding`; everything else is
  // public). redirectOptions still feeds the module's own login/callback paths.
  supabase: {
    url: supabaseUrl || DEMO_SUPABASE_URL,
    key: supabaseKey || DEMO_SUPABASE_KEY,
    secretKey: supabaseSecretKey || DEMO_SUPABASE_KEY,
    redirect: false,
    // No `database.types.ts` in a template — clones generate one and point
    // `types` at it (see project_bootstrap.md).
    types: false,
    redirectOptions: {
      login: '/auth/login',
      callback: '/auth/confirm',
      exclude: ['/', '/auth/**']
    },
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 400, // 400 days — @supabase/ssr default; session validity is enforced server-side, so a short Max-Age is pure UX harm. NB: iOS Safari ITP caps JS-written cookies at ~7 days; only server Set-Cookie (SSR refresh) gets the full lifetime.
      domain: '',
      path: '/',
      sameSite: 'lax'
    },
    clientOptions: {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storage: undefined // let the module own storage via cookies
      }
    }
  }
})
