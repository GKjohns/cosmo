/**
 * Timezone helpers + composable.
 *
 * Lifted from Daylight; cosmo uses it for the settings/profile timezone
 * picker and for any date-bucketing in worker code that needs a user's
 * "today" boundaries.
 */

// Common timezone options for the settings UI quick-select grid.
export const TIMEZONE_OPTIONS = [
  { label: 'Eastern Time (New York)', value: 'America/New_York' },
  { label: 'Central Time (Chicago)', value: 'America/Chicago' },
  { label: 'Mountain Time (Denver)', value: 'America/Denver' },
  { label: 'Pacific Time (Los Angeles)', value: 'America/Los_Angeles' },
  { label: 'Alaska Time', value: 'America/Anchorage' },
  { label: 'Hawaii Time', value: 'Pacific/Honolulu' },
  { label: 'Arizona (No DST)', value: 'America/Phoenix' },
  { label: 'UTC', value: 'UTC' },
  { label: 'London (GMT/BST)', value: 'Europe/London' },
  { label: 'Paris (CET/CEST)', value: 'Europe/Paris' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'Sydney (AEST/AEDT)', value: 'Australia/Sydney' },
  { label: 'Auckland (NZST/NZDT)', value: 'Pacific/Auckland' }
] as const

export function getAllTimezones(): { label: string, value: string }[] {
  try {
    const timezones = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined
    if (!timezones) return [...TIMEZONE_OPTIONS]
    return timezones.map(tz => ({
      label: tz.replace(/_/g, ' ').replace(/\//g, ' / '),
      value: tz
    }))
  }
  catch {
    return [...TIMEZONE_OPTIONS]
  }
}

export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  catch {
    return 'UTC'
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  }
  catch {
    return false
  }
}

export function getDateStringInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export function formatDateInTimezone(
  date: Date | string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString(undefined, {
    timeZone: timezone,
    ...options
  })
}

export function useTimezone() {
  const user = useSupabaseUser()
  const { profile, isFetched, updateProfile, isLoading: profileLoading } = useProfile()

  const userTimezone = useState<string>('user-timezone', () => detectBrowserTimezone())
  const isLoading = ref(false)
  const isSynced = ref(false)

  async function saveTimezone(timezone: string): Promise<boolean> {
    if (!isValidTimezone(timezone)) {
      // eslint-disable-next-line no-console
      console.error('[useTimezone] Invalid timezone:', timezone)
      return false
    }

    isLoading.value = true
    try {
      const updatedProfile = await updateProfile({ timezone })
      if (!updatedProfile) return false

      userTimezone.value = updatedProfile.timezone || timezone
      isSynced.value = true
      return true
    }
    catch (err) {
      // eslint-disable-next-line no-console
      console.error('[useTimezone] Error saving timezone:', err)
      return false
    }
    finally {
      isLoading.value = false
    }
  }

  watch([profile, isFetched], async ([profileData, fetched]) => {
    if (!user.value?.id) {
      userTimezone.value = detectBrowserTimezone()
      isSynced.value = false
      return
    }

    if (fetched && profileData) {
      const savedTimezone = profileData.timezone
      if (savedTimezone && isValidTimezone(savedTimezone)) {
        userTimezone.value = savedTimezone
        isSynced.value = true
      }
      else if (!savedTimezone) {
        await saveTimezone(detectBrowserTimezone())
      }
    }
  }, { immediate: true })

  function getTodayDateString(): string {
    return getDateStringInTimezone(new Date(), userTimezone.value)
  }

  function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
    return formatDateInTimezone(date, userTimezone.value, options)
  }

  return {
    timezone: userTimezone,
    isLoading: readonly(isLoading),
    profileLoading,
    isSynced: readonly(isSynced),
    saveTimezone,
    getTodayDateString,
    formatDate,
    detectBrowserTimezone,
    isValidTimezone,
    getDateStringInTimezone,
    formatDateInTimezone
  }
}
