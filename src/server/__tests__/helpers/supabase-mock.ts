/**
 * Hand-rolled Supabase client stub: a generic chainable query builder that
 * records every call and resolves to whatever the test wired up per table.
 *
 * `vi.mock('#supabase/server', …)` is declared inline in each test file
 * (vi.mock hoists with literal paths only); this builder produces the stub
 * that the mock factory returns.
 *
 * Any method chain works (`from().select().eq().maybeSingle()`,
 * `from().insert()`, `from().update().eq()`, …). Every chain is thenable, so
 * `await`ing it at any depth resolves to `{ data, error, count }` for that
 * table (or the default `{ data: null, error: null }`). Terminal verbs
 * (`insert`, `upsert`, `update`, `delete`) are recorded in `calls` so a test
 * can assert what the handler wrote.
 */

export interface TableResult {
  data?: unknown
  error?: { code?: string, message?: string } | null
  count?: number | null
}

export interface SupabaseStubOptions {
  // Per-table result. A function receives the terminal verb so a table can
  // answer differently to a read vs. a write.
  tables?: Record<string, TableResult | ((verb: string) => TableResult)>
}

export interface RecordedCall {
  table: string
  verb: string
  args: unknown[]
}

interface Chain {
  then: (resolve: (v: TableResult) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
  [key: string]: unknown
}

export function createSupabaseStub(opts: SupabaseStubOptions = {}) {
  const calls: RecordedCall[] = []

  const resolveFor = (table: string, verb: string): TableResult => {
    const entry = opts.tables?.[table]
    const result = typeof entry === 'function' ? entry(verb) : entry
    return { data: null, error: null, count: null, ...(result ?? {}) }
  }

  const makeChain = (table: string, verb: string): Chain => {
    const target = {} as Chain
    return new Proxy(target, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: TableResult) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(resolveFor(table, verb)).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          const name = String(prop)
          const isVerb = ['insert', 'upsert', 'update', 'delete', 'select', 'rpc'].includes(name)
          if (isVerb) calls.push({ table, verb: name, args })
          return makeChain(table, isVerb ? name : verb)
        }
      }
    })
  }

  return {
    calls,
    /** Rows a test can inspect: every terminal write, in order. */
    writes: (table: string, verb?: string) =>
      calls.filter(c => c.table === table && (!verb || c.verb === verb)),
    from: (table: string) => makeChain(table, 'from'),
    // `supabase.schema('analytics').rpc('log_event', …)` — keyed as `rpc:<fn>`.
    schema: (_name: string) => ({
      rpc: async (fn: string, args: unknown) => {
        calls.push({ table: `rpc:${fn}`, verb: 'rpc', args: [args] })
        return resolveFor(`rpc:${fn}`, 'rpc')
      }
    })
  }
}

export type SupabaseStub = ReturnType<typeof createSupabaseStub>
