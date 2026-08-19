/**
 * Shapes for the `/app` home widgets (`components/home/*`), inherited from
 * the Nuxt UI dashboard template. Project-specific types belong next to the
 * feature that owns them, not here.
 */

export type SaleStatus = 'completed' | 'failed' | 'aborted'

export interface Stat {
  title: string
  icon: string
  value: number | string
  variation: number
  formatter?: (value: number) => string
}

export interface Sale {
  id: string
  date: string
  status: SaleStatus
  email: string
  amount: number
}

export type Period = 'daily' | 'weekly' | 'monthly'

export interface Range {
  start: Date
  end: Date
}
