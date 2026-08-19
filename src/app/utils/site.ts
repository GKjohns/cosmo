/**
 * The single rebrand point. Every crawler-facing string — <title> template,
 * meta description, canonical / OG URLs, JSON-LD, robots.txt's Sitemap line,
 * the sitemap's absolute URLs — hangs off this object. A new project edits
 * these three values (and `public/site.webmanifest`, which can't import TS)
 * and nothing else has to change.
 *
 * `url` has no trailing slash and names the canonical host — if the apex
 * redirects to `www`, put `www` here or Google sees two sites.
 */
export const SITE = {
  name: 'Cosmo',
  description: 'Cosmo is the Monument Labs starter — Nuxt 4, Supabase, Inngest. Clone it to bootstrap a new project with auth, multi-tenant orgs, billing, and AI chat already wired.',
  url: 'https://cosmo.example.com'
} as const
