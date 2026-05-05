<script setup lang="ts">
import * as z from 'zod'
import type { FormErrorEvent, FormSubmitEvent } from '@nuxt/ui'

const toast = useToast()
const { profile, fetchProfile, updateProfile, isLoading } = useProfile()
const {
  timezone,
  saveTimezone,
  detectBrowserTimezone,
  isLoading: tzLoading
} = useTimezone()

const profileSchema = z.object({
  display_name: z.string().trim().min(2, 'Display name is too short.'),
  title: z.string().trim().max(120).optional(),
  current_focus: z.string().trim().max(160, 'Keep this under 160 characters.').optional(),
  timezone: z.string().trim().min(1, 'Pick a timezone.')
})

type ProfileSchema = z.output<typeof profileSchema>

const state = reactive<ProfileSchema>({
  display_name: '',
  title: '',
  current_focus: '',
  timezone: timezone.value
})

const isSaving = ref(false)

watch(() => profile.value, (value) => {
  if (!value) return

  state.display_name = value.display_name || ''
  state.title = value.title || ''
  state.current_focus = value.current_focus || ''
  state.timezone = value.timezone || timezone.value
}, { immediate: true })

watch(timezone, (tz) => {
  if (!state.timezone) state.timezone = tz
})

const allTimezones = getAllTimezones()
const timezoneItems = computed(() => allTimezones.map(tz => ({ label: tz.label, value: tz.value })))
const timezoneLabel = computed(() => {
  const found = allTimezones.find(tz => tz.value === state.timezone)
  return found?.label || state.timezone
})

const avatar = computed(() => ({
  alt: state.display_name || 'Profile avatar',
  text: state.display_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U'
}))

function detectAndSet() {
  state.timezone = detectBrowserTimezone()
}

function onError(event: FormErrorEvent) {
  const firstError = event.errors[0]
  if (!firstError) return
  toast.add({
    title: 'Profile needs attention',
    description: firstError.message,
    color: 'warning'
  })
}

async function saveProfile(event: FormSubmitEvent<ProfileSchema>) {
  isSaving.value = true
  try {
    await updateProfile({
      display_name: event.data.display_name,
      title: event.data.title || null,
      current_focus: event.data.current_focus || null,
      timezone: event.data.timezone
    })
    // Sync the reactive timezone state in case the user changed it.
    if (event.data.timezone !== timezone.value) {
      await saveTimezone(event.data.timezone)
    }
    await fetchProfile()
    await refreshNuxtData('organization-context')
    toast.add({ title: 'Profile saved', color: 'success' })
  }
  catch (err) {
    toast.add({
      title: 'Unable to save profile',
      description: err instanceof Error ? err.message : 'Try again in a moment.',
      color: 'error'
    })
  }
  finally {
    isSaving.value = false
  }
}
</script>

<template>
  <UForm
    :schema="profileSchema"
    :state="state"
    class="space-y-6"
    @submit="saveProfile"
    @error="onError"
  >
    <UPageCard
      title="Profile"
      description="Your name, role, and the timezone the app uses for date displays."
      variant="naked"
      orientation="horizontal"
      class="mb-2"
    >
      <UButton
        type="submit"
        label="Save changes"
        color="neutral"
        :loading="isSaving"
        class="w-fit lg:ms-auto"
      />
    </UPageCard>

    <UPageCard variant="subtle">
      <div class="flex items-center gap-4 pb-4 border-b border-default">
        <UAvatar v-bind="avatar" size="lg" />
        <div class="text-sm">
          <p class="font-medium text-highlighted">
            {{ state.display_name || 'Your profile' }}
          </p>
          <p class="text-muted">
            Avatar uploads land in Sprint 3.
          </p>
        </div>
      </div>

      <UFormField
        name="display_name"
        label="Display name"
        description="Shown across the app and to teammates."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="state.display_name"
          autocomplete="off"
        />
      </UFormField>
      <USeparator />
      <UFormField
        name="title"
        label="Role"
        description="Optional. e.g. 'Tech lead'."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput v-model="state.title" autocomplete="off" />
      </UFormField>
      <USeparator />
      <UFormField
        name="current_focus"
        label="Current focus"
        description="Short status — what you're working on right now."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput v-model="state.current_focus" autocomplete="off" />
      </UFormField>
      <USeparator />
      <UFormField
        name="timezone"
        label="Timezone"
        description="Used for 'today' boundaries and date display."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <USelectMenu
            v-model="state.timezone"
            :items="timezoneItems"
            value-key="value"
            placeholder="Select timezone..."
            searchable
            searchable-placeholder="Search timezones..."
            class="min-w-64"
          >
            <template #default>
              <span class="truncate">{{ timezoneLabel }}</span>
            </template>
          </USelectMenu>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-locate"
            :loading="tzLoading"
            @click="detectAndSet"
          >
            Detect
          </UButton>
        </div>
      </UFormField>
    </UPageCard>
  </UForm>
</template>
