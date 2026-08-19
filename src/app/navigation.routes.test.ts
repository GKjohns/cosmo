import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Regression guard for the sidebar: every nav route must resolve to a backing
 * page file. A nav entry pointing at a route with no page 404s when clicked
 * and emits a Vue Router warning — exactly the bug Sprint 1 of the 2026-08
 * refresh fixed. Routes are read straight out of `useNavigation.ts` (every
 * `to: '/...'` literal), so adding a nav entry needs no test edit.
 */
const appDir = fileURLToPath(new URL('.', import.meta.url))
const pagesDir = join(appDir, 'pages')

const navSource = readFileSync(join(appDir, 'composables/useNavigation.ts'), 'utf8')
const NAV_ROUTES = [...new Set(
  [...navSource.matchAll(/\bto: '(\/[^']*)'/g)].map(m => m[1]!)
)]

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory()

/**
 * Resolve a route to a page file the way Nuxt's file-based router does:
 * `index.vue`, `segment.vue`, dynamic `[param]`, and catch-all `[...slug]`.
 */
function resolvesToPage(route: string): boolean {
  const segments = route.split('/').filter(Boolean)
  let dir = pagesDir

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    const isLast = i === segments.length - 1
    const entries = existsSync(dir) ? readdirSync(dir) : []

    // A catch-all (`[...slug].vue`) at this level swallows this segment and
    // everything after it.
    if (entries.some(e => /^\[\.\.\..+\]\.vue$/.test(e))) return true

    if (isLast) {
      if (entries.includes(`${seg}.vue`)) return true
      if (isDir(join(dir, seg)) && existsSync(join(dir, seg, 'index.vue'))) return true
      // single-segment dynamic page, e.g. `[id].vue`
      if (entries.some(e => /^\[[^.].*\]\.vue$/.test(e))) return true
      return false
    }

    // Not the last segment — we must descend into a directory.
    if (isDir(join(dir, seg))) {
      dir = join(dir, seg)
      continue
    }
    const dynamicDir = entries.find(e => /^\[[^.].*\]$/.test(e) && isDir(join(dir, e)))
    if (dynamicDir) {
      dir = join(dir, dynamicDir)
      continue
    }
    return false
  }

  return false
}

describe('useNavigation routes', () => {
  it('found routes to check', () => {
    expect(NAV_ROUTES.length).toBeGreaterThan(0)
  })

  it.each(NAV_ROUTES)('route %s has a backing page file', (route) => {
    expect(resolvesToPage(route)).toBe(true)
  })

  it('the resolver rejects a route with no page (sanity check)', () => {
    expect(resolvesToPage('/app/this-route-does-not-exist')).toBe(false)
  })
})
