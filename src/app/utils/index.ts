export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function randomFrom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]!
}

/**
 * Loose shape of what `$fetch` / Supabase / Nuxt throw. Catch clauses receive
 * `unknown`; cast to this before reading a message instead of using `any`.
 */
export interface CaughtError {
  message?: string
  statusCode?: number
  data?: { message?: string, statusMessage?: string }
}
