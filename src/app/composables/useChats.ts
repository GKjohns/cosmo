import { isToday, isYesterday, subMonths } from 'date-fns'

/**
 * Date-bucketed chat groups for the sidebar (`type: 'label'` headers) and
 * the ⌘K palette (`UDashboardSearch` groups). Copied from
 * `nuxt-ui-templates/chat` `useChats.ts` (Aug 2026); generic over the item
 * shape so it takes cosmo's `/api/chats` rows as-is.
 */
export interface ChatGroup<T> {
  id: string
  label: string
  items: T[]
}

export function useChats<T extends { createdAt: string }>(chats: Ref<T[] | undefined | null>) {
  const groups = computed<ChatGroup<T>[]>(() => {
    // Group chats by date
    const today: T[] = []
    const yesterday: T[] = []
    const lastWeek: T[] = []
    const lastMonth: T[] = []
    const older: Record<string, T[]> = {}

    const oneWeekAgo = subMonths(new Date(), 0.25) // ~7 days ago
    const oneMonthAgo = subMonths(new Date(), 1)

    chats.value?.forEach((chat) => {
      const chatDate = new Date(chat.createdAt)

      if (isToday(chatDate)) {
        today.push(chat)
      } else if (isYesterday(chatDate)) {
        yesterday.push(chat)
      } else if (chatDate >= oneWeekAgo) {
        lastWeek.push(chat)
      } else if (chatDate >= oneMonthAgo) {
        lastMonth.push(chat)
      } else {
        // Format: "January 2023", "February 2023", etc.
        const monthYear = chatDate.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric'
        })

        if (!older[monthYear]) {
          older[monthYear] = []
        }

        older[monthYear].push(chat)
      }
    })

    // Sort older chats by month-year in descending order (newest first)
    const sortedMonthYears = Object.keys(older).sort((a, b) => {
      const dateA = new Date(a)
      const dateB = new Date(b)
      return dateB.getTime() - dateA.getTime()
    })

    const formattedGroups: ChatGroup<T>[] = []

    if (today.length) {
      formattedGroups.push({ id: 'today', label: 'Today', items: today })
    }

    if (yesterday.length) {
      formattedGroups.push({ id: 'yesterday', label: 'Yesterday', items: yesterday })
    }

    if (lastWeek.length) {
      formattedGroups.push({ id: 'last-week', label: 'Last week', items: lastWeek })
    }

    if (lastMonth.length) {
      formattedGroups.push({ id: 'last-month', label: 'Last month', items: lastMonth })
    }

    sortedMonthYears.forEach((monthYear) => {
      if (older[monthYear]?.length) {
        formattedGroups.push({ id: monthYear, label: monthYear, items: older[monthYear] })
      }
    })

    return formattedGroups
  })

  return {
    groups
  }
}
