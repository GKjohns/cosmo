/**
 * Which deployment wrote an event.
 *
 * Dev, preview and production typically share one Supabase project, so local
 * `npm run dev` writes real rows into `analytics.events`. `context.env` is
 * what keeps them apart: `analytics.real_events` filters to
 * `env = 'production'`, so anything tagged `development` or `preview` is
 * invisible to dashboards, skills and ad-hoc funnel SQL without ever being
 * deleted. `email.ts` keys its send gate off the same value, so a preview
 * deploy can never mail a real user.
 *
 * `VERCEL_ENV` is authoritative. Deliberately dependency-free (no
 * `useRuntimeConfig`) so it is safe to call from a Nitro plugin's error hook
 * and from Inngest workers, where the Nuxt context may not exist.
 */
export function analyticsEnv(): string {
  return process.env.VERCEL_ENV || 'development'
}
