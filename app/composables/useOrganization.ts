/**
 * Multi-org context: list of orgs the user belongs to, the active one,
 * a switcher, and a `needsOnboarding` flag the dashboard middleware uses
 * to redirect a fresh user with zero memberships to `/onboarding`.
 */

type ProfileRecord = {
  id: string
  display_name: string | null
  avatar_url: string | null
}

type OrganizationRecord = {
  id: string
  name: string
  slug: string
  created_at: string
}

type OrgMembership = {
  membershipId: string
  role: 'admin' | 'member'
  organization: OrganizationRecord
}

type OrgContextResponse = {
  profile: ProfileRecord | null
  memberships: OrgMembership[]
  organizations: OrganizationRecord[]
}

const activeOrgId = () => useCookie<string | null>('cosmo-org-id', {
  maxAge: 60 * 60 * 24 * 365,
  default: () => null
})

export function useOrganization() {
  const orgCookie = activeOrgId()

  const emptyContext = (): OrgContextResponse => ({
    profile: null,
    memberships: [],
    organizations: []
  })

  const { data, pending, error, refresh } = useFetch<OrgContextResponse>('/api/app/organization-context', {
    key: 'organization-context',
    default: emptyContext
  })

  const organizations = computed<OrganizationRecord[]>(() => data.value?.organizations ?? [])
  const memberships = computed<OrgMembership[]>(() => data.value?.memberships ?? [])
  const profile = computed<ProfileRecord | null>(() => data.value?.profile ?? null)

  const activeOrganization = computed<OrganizationRecord | null>(() => {
    const orgs = organizations.value
    if (orgs.length === 0) return null

    if (orgCookie.value) {
      const match = orgs.find((o: OrganizationRecord) => o.id === orgCookie.value)
      if (match) return match
    }

    return orgs[0] ?? null
  })

  const activeMembership = computed<OrgMembership | null>(() => {
    const org = activeOrganization.value
    if (!org) return null
    return memberships.value.find((m: OrgMembership) => m.organization.id === org.id) ?? null
  })

  const isAdmin = computed(() => activeMembership.value?.role === 'admin')

  async function switchOrganization(orgId: string) {
    orgCookie.value = orgId
    await refreshNuxtData()
  }

  const isLoaded = computed(() => !pending.value && data.value !== null)
  const hasOrganizationAccess = computed(() => Boolean(activeOrganization.value))
  const needsOnboarding = computed(() => isLoaded.value && !hasOrganizationAccess.value)

  return {
    data,
    pending,
    error,
    refresh,
    profile,
    organizations,
    memberships,
    activeOrganization,
    activeMembership,
    isAdmin,
    isLoaded,
    switchOrganization,
    activeOrgId: computed(() => activeOrganization.value?.id ?? null),
    hasOrganizationAccess,
    needsOnboarding
  }
}
