/**
 * Composable for managing user profile data throughout the application.
 *
 * Fetches the profile from `/api/app/profile`. Falls back to OAuth metadata
 * + email when the profile row hasn't been hydrated yet (the
 * `handle_new_user` trigger inserts a row at signup, so this is a brief
 * window during the first request). Exposes `needsOnboarding` for the
 * dashboard middleware.
 */

interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  timezone: string | null
  is_employee: boolean
  is_test_user: boolean
  current_focus: string | null
  title: string | null
  skills: string[]
  is_technical: boolean
  ai_context: string | null
  created_at: string
  updated_at: string
}

interface ProfileResponse {
  profile: Profile | null
  needsOnboarding: boolean
}

export function useProfile() {
  const user = useSupabaseUser()
  const getUserId = () => (user.value as any)?.id || (user.value as any)?.sub

  const profile = useState<Profile | null>('user-profile', () => null)
  const isLoading = ref(false)
  const isFetched = useState<boolean>('user-profile-fetched', () => false)
  const needsOnboarding = useState<boolean>('needs-onboarding', () => false)

  async function fetchProfile(): Promise<Profile | null> {
    if (!getUserId()) return null

    isLoading.value = true
    try {
      const response = await $fetch<ProfileResponse>('/api/app/profile')
      profile.value = response.profile
      needsOnboarding.value = response.needsOnboarding
      isFetched.value = true
      return response.profile
    }
    catch (err: any) {
      // 401 expected on public routes — quiet that one path.
      if (err?.statusCode !== 401) {
        // eslint-disable-next-line no-console
        console.error('[useProfile] Error fetching profile:', err)
      }
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  async function updateProfile(
    updates: Partial<Pick<Profile, 'display_name' | 'timezone' | 'avatar_url' | 'title' | 'skills' | 'current_focus' | 'is_technical' | 'ai_context'>>
  ): Promise<Profile | null> {
    if (!getUserId()) return null

    isLoading.value = true
    try {
      const response = await $fetch<{ profile: Profile }>('/api/app/profile', {
        method: 'PATCH',
        body: updates
      })
      profile.value = response.profile
      return response.profile
    }
    catch (err: any) {
      if (err?.statusCode !== 401) {
        // eslint-disable-next-line no-console
        console.error('[useProfile] Error updating profile:', err)
      }
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  // Auto-fetch when the auth user appears.
  watch(user, async (newUser) => {
    const userId = (newUser as any)?.id || (newUser as any)?.sub
    if (userId) {
      if (!isFetched.value) {
        await fetchProfile()
      }
    }
    else {
      profile.value = null
      isFetched.value = false
      needsOnboarding.value = false
    }
  }, { immediate: true })

  // Display name precedence: profile.display_name → OAuth metadata → email.
  const displayName = computed(() => {
    if (profile.value?.display_name) return profile.value.display_name

    const oauthMeta = (user.value as any)?.user_metadata
    if (oauthMeta?.preferred_name) return oauthMeta.preferred_name
    if (oauthMeta?.full_name) return oauthMeta.full_name
    if (oauthMeta?.name) return oauthMeta.name

    return user.value?.email || 'Account'
  })

  // Avatar precedence: profile.avatar_url → OAuth metadata → empty.
  const avatarUrl = computed(() => {
    if (profile.value?.avatar_url) return profile.value.avatar_url

    const oauthMeta = (user.value as any)?.user_metadata
    return oauthMeta?.avatar_url || oauthMeta?.picture || ''
  })

  const email = computed(() => user.value?.email || '')

  const initial = computed(() => {
    const source = displayName.value || email.value || ''
    return source.trim().charAt(0).toUpperCase() || 'U'
  })

  const isEmployee = computed(() => Boolean(profile.value?.is_employee))

  return {
    profile: readonly(profile),
    isLoading: readonly(isLoading),
    isFetched: readonly(isFetched),
    needsOnboarding: readonly(needsOnboarding),
    displayName,
    avatarUrl,
    email,
    initial,
    isEmployee,
    fetchProfile,
    updateProfile
  }
}
