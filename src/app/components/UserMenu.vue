<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const colorMode = useColorMode()
const supabase = useSupabaseClient()
const router = useRouter()
const isDemo = useDemoMode()
const { displayName, avatarUrl, email, initial } = useProfile()

const userAvatar = computed(() => ({
  src: avatarUrl.value || undefined,
  alt: displayName.value,
  text: avatarUrl.value ? undefined : initial.value
}))

async function logOut() {
  // Demo mode has no Supabase session to sign out of — just bounce home.
  if (!isDemo.value) {
    await supabase.auth.signOut()
  }
  await router.push('/')
}

const items = computed<DropdownMenuItem[][]>(() => ([[{
  type: 'label',
  label: displayName.value,
  avatar: userAvatar.value
}], [{
  label: 'Profile',
  icon: 'i-lucide-user',
  to: '/app/settings'
}, {
  label: 'Billing',
  icon: 'i-lucide-credit-card'
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/app/settings'
}], [{
  label: 'Appearance',
  icon: 'i-lucide-sun-moon',
  children: [{
    label: 'Light',
    icon: 'i-lucide-sun',
    type: 'checkbox',
    checked: colorMode.value === 'light',
    onSelect(e: Event) {
      e.preventDefault()

      colorMode.preference = 'light'
    }
  }, {
    label: 'Dark',
    icon: 'i-lucide-moon',
    type: 'checkbox',
    checked: colorMode.value === 'dark',
    onUpdateChecked(checked: boolean) {
      if (checked) {
        colorMode.preference = 'dark'
      }
    },
    onSelect(e: Event) {
      e.preventDefault()
    }
  }]
}], [{
  label: 'Documentation',
  icon: 'i-lucide-book-open',
  to: '/docs',
  target: '_blank'
}, {
  label: 'Log out',
  icon: 'i-lucide-log-out',
  onSelect: (e: Event) => {
    e.preventDefault()
    logOut()
  }
}]]))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      :avatar="userAvatar"
      :label="collapsed ? undefined : (displayName || email)"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{
        trailingIcon: 'text-dimmed'
      }"
    />
  </UDropdownMenu>
</template>
