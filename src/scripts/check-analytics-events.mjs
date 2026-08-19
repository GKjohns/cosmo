#!/usr/bin/env node
/**
 * Registry ↔ call sites, diffed mechanically.
 *
 * The typed registry (`shared/utils/analytics-events.ts`) already makes a
 * misspelled event name a compile error. What it cannot see is the silent
 * failure mode: a registry entry nobody ever fires — a "ghost". It reads like
 * data you have, so a funnel query written against it returns zero and looks
 * like a product problem instead of a missing call site.
 *
 * Run it with `npm run check:analytics-events`. Exit code 1 means the registry
 * and the call sites disagree. (Camera Shy's version also diffs a guide doc;
 * cosmo's registry IS the guide — each value is the event's one-line entry —
 * so that leg is off here.)
 *
 * Deliberately dependency-free and deliberately textual: it greps rather than
 * parsing a TypeScript AST, because the thing being checked is whether a name
 * literally appears next to a logging call.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = dirname(dirname(fileURLToPath(import.meta.url)))
const REPO = dirname(SRC)

const REGISTRY = join(SRC, 'shared/utils/analytics-events.ts')
const SCAN_DIRS = ['app', 'server', 'shared'].map(dir => join(SRC, dir))
const SCAN_EXTENSIONS = ['.ts', '.vue', '.js', '.mjs']

/** The logging surfaces. A name is "instrumented" when it is the first quoted
 *  string after one of these. */
const LOG_CALLS = [
  'logEventBeacon',
  'logAnalyticsEventDetached',
  'logAnalyticsEvent',
  'logWorkerAnalyticsEvent',
  'logEvent'
]

/**
 * Events that legitimately have no JS call site: both are triggers on `auth.*`
 * tables (migration 0004), so the writer is Postgres, not this codebase.
 * Anything added here needs a reason of that shape.
 */
const NO_CALL_SITE = new Set(['user_signed_up', 'user_logged_in'])

/** The `EVENTS` keys, in declaration order. */
function readRegistry() {
  const source = readFileSync(REGISTRY, 'utf8')
  const body = source.slice(source.indexOf('export const EVENTS = {'))
  return [...body.matchAll(/^ {2}([a-z][a-z0-9_]*):/gm)].map(match => match[1])
}

function walk(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...walk(path))
    else if (SCAN_EXTENSIONS.some(ext => entry.endsWith(ext))) found.push(path)
  }
  return found
}

/**
 * The event name in a call's argument list, or null if this occurrence isn't a
 * call at all.
 *
 * Allows any number of bare identifier arguments before the name, which is what
 * lets one pattern match both `logEvent('stage_opened')` and the server's
 * `logAnalyticsEvent(\n  event,\n  'session_finalized',`. It deliberately does
 * NOT match a declaration — `function logEvent(eventType: …` has a `:` where
 * this expects a comma — nor a destructuring import, nor a mention in prose.
 */
const CALL_ARGUMENT = /^\s*\(\s*(?:[A-Za-z_$][\w$]*\s*,\s*)*['"]([a-z][a-z0-9_]*)['"]/

/**
 * Every event name that is actually fired, mapped to where.
 *
 * Scans forward from each logging call rather than matching a single line: the
 * server calls pass the event name on its own line, several arguments in.
 */
function findCallSites() {
  const sites = new Map()

  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      if (file === REGISTRY) continue
      const source = readFileSync(file, 'utf8')

      for (const call of LOG_CALLS) {
        let from = source.indexOf(call)
        while (from !== -1) {
          const window = source.slice(from + call.length, from + call.length + 240)
          const name = window.match(CALL_ARGUMENT)?.[1]
          if (name) {
            const line = source.slice(0, from).split('\n').length
            if (!sites.has(name)) sites.set(name, [])
            sites.get(name).push(`${relative(REPO, file)}:${line}`)
          }
          from = source.indexOf(call, from + call.length)
        }
      }
    }
  }

  return sites
}

const registry = readRegistry()
const known = new Set(registry)
const sites = findCallSites()
const problems = []

if (!registry.length) {
  problems.push(`Parsed 0 events out of ${relative(REPO, REGISTRY)} — the registry shape changed and this script is now blind.`)
}

for (const name of registry) {
  if (sites.has(name) || NO_CALL_SITE.has(name)) continue
  problems.push(`ghost event: \`${name}\` is in the registry but nothing fires it. Instrument it, or delete the entry.`)
}

for (const [name, where] of sites) {
  if (known.has(name)) continue
  problems.push(`unregistered event: \`${name}\` is fired at ${where.join(', ')} but is not in the registry.`)
}

const instrumented = registry.filter(name => sites.has(name)).length
console.log(
  `analytics events: ${registry.length} registered · ${instrumented} instrumented · `
  + `${NO_CALL_SITE.size} DB triggers`
)

if (problems.length) {
  console.error(`\n✗ ${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('✓ registry and call sites agree.')
