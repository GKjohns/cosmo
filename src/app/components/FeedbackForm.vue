<script setup lang="ts">
/**
 * 3-question in-product feedback form. Lifted from Margin's `FeedbackForm.vue`,
 * trimmed to remove project-specific affordances (partial-session sign-in
 * prompt, brand-name in copy).
 *
 * Mount wherever a project wants feedback (sidebar slot, modal, dedicated
 * page). The form fires `/api/feedback` and logs analytics events along the
 * way (form_viewed, form_started, submitted).
 *
 * Anonymous + authenticated traffic both work. Authed users do not see the
 * email + allow_contact fields.
 */
const props = defineProps<{
  /** Optional product name shown in copy. Defaults to "us". */
  productName?: string
  /** Where the back-to button goes after submit (auth users default `/app`,
   *  anon users default `/`). */
  backTo?: string
}>()

const route = useRoute()
const toast = useToast()
const user = useSupabaseUser()
const { logEvent } = useAnalytics()
const { profile, isLoading: profileLoading } = useProfile()

const productLabel = computed(() => props.productName || 'us')

// Greeting: prefer the most stable source available so the UI doesn't snap.
const greetingName = computed(() => {
  if (!user.value) return ''

  const meta = user.value.user_metadata as Record<string, unknown> | undefined
  const metaName = String(meta?.full_name ?? meta?.name ?? meta?.display_name ?? '').trim()
  if (metaName) return metaName.split(' ')[0]

  if (profileLoading.value) return ''

  const profileName = profile.value?.display_name || ''
  if (profileName) return profileName.split(' ')[0]

  const email = user.value.email?.trim()
  if (email?.includes('@')) return email.split('@')[0]

  return ''
})

const safeFrom = computed<string | null>(() => {
  const from = route.query.from
  if (typeof from !== 'string') return null
  if (!from.startsWith('/')) return null
  return from
})

const backTo = computed(() => {
  if (props.backTo) return props.backTo
  if (user.value) return safeFrom.value || '/app'
  return '/'
})

const backLabel = computed(() => {
  if (user.value) return safeFrom.value ? 'Back' : 'Back to dashboard'
  return 'Back to home'
})

const form = reactive({
  q1_trying_to_do: '',
  q2_blockers: '',
  q3_indispensable: '',
  email: ''
})

const loading = ref(false)
const submitted = ref(false)
const hasStartedForm = ref(false)

// Anon-only: opt-in to follow-up contact, defaults to checked when an email is provided.
const allowContact = ref(true)
const showAllowContact = computed(() => !user.value && form.email.trim().length > 0)

watch(
  () => form.email.trim(),
  (email) => {
    if (!email) allowContact.value = true
  }
)

const pageContext = computed(() => {
  if (import.meta.client) {
    return document.referrer || (route.query.from as string) || route.fullPath
  }
  return (route.query.from as string) || route.fullPath
})

const hasContent = computed(() => {
  return !!(form.q1_trying_to_do.trim() || form.q2_blockers.trim() || form.q3_indispensable.trim())
})

onMounted(() => {
  logEvent('feedback_form_viewed', {
    isAuthenticated: !!user.value
  }, { context: { pageContext: pageContext.value } })
})

watch(
  () => form.q1_trying_to_do + form.q2_blockers + form.q3_indispensable,
  (content) => {
    if (content.length > 0 && !hasStartedForm.value) {
      hasStartedForm.value = true
      logEvent('feedback_form_started', { isAuthenticated: !!user.value })
    }
  }
)

async function submit() {
  if (loading.value || submitted.value) return
  if (!hasContent.value) return

  loading.value = true

  try {
    await $fetch('/api/feedback', {
      method: 'POST',
      body: {
        q1_trying_to_do: form.q1_trying_to_do.trim() || null,
        q2_blockers: form.q2_blockers.trim() || null,
        q3_indispensable: form.q3_indispensable.trim() || null,
        email: form.email.trim() || null,
        allow_contact: showAllowContact.value ? allowContact.value : null,
        page_context: pageContext.value
      }
    })

    submitted.value = true

    logEvent(
      'feedback_submitted',
      {
        isAnonymous: !user.value,
        hasEmail: !user.value && !!form.email.trim(),
        hasQ1: !!form.q1_trying_to_do.trim(),
        hasQ2: !!form.q2_blockers.trim(),
        hasQ3: !!form.q3_indispensable.trim()
      },
      { context: { pageContext: pageContext.value } }
    )
  }
  catch (error: any) {
    toast.add({
      title: 'Failed to submit feedback',
      description: error?.data?.message || error?.data?.statusMessage || 'Please try again.',
      color: 'error'
    })
  }
  finally {
    loading.value = false
  }
}

function resetForm() {
  form.q1_trying_to_do = ''
  form.q2_blockers = ''
  form.q3_indispensable = ''
  form.email = ''
  submitted.value = false
  hasStartedForm.value = false
}
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <!-- Success state -->
    <div v-if="submitted" class="text-center py-16">
      <div class="size-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
        <UIcon name="i-lucide-check" class="size-8 text-success" />
      </div>
      <h2 class="text-2xl font-semibold text-highlighted mb-2">
        Got it. Thanks for the feedback.
      </h2>
      <p class="text-muted mb-6">
        We read every submission and use it to make the product better.
      </p>
      <div class="flex items-center justify-center gap-3">
        <UButton
          :to="backTo"
          icon="i-lucide-arrow-left"
        >
          {{ backLabel }}
        </UButton>
        <UButton color="neutral" variant="outline" @click="resetForm">
          Submit more
        </UButton>
      </div>
    </div>

    <!-- Form -->
    <div v-else>
      <div class="mb-8">
        <h1 class="text-2xl font-semibold tracking-tight text-highlighted mb-2">
          Share Feedback
        </h1>
        <p class="text-lg text-muted">
          <template v-if="user">
            <span>Thanks for taking a moment</span><span
              v-if="greetingName"
              class="transition-opacity duration-200"
            >, {{ greetingName }}</span><span>.</span>
          </template>
          <template v-else>
            Help us make {{ productLabel }} better.
          </template>
        </p>
      </div>

      <form class="space-y-6" @submit.prevent="submit">
        <UFormField label="What were you trying to do?" name="q1">
          <UTextarea
            v-model="form.q1_trying_to_do"
            :rows="3"
            placeholder="Describe your task or goal..."
            autoresize
            :maxrows="8"
            class="w-full"
          />
        </UFormField>

        <UFormField label="What got in your way—or what's missing?" name="q2">
          <UTextarea
            v-model="form.q2_blockers"
            :rows="3"
            placeholder="Bugs, friction, missing features..."
            autoresize
            :maxrows="8"
            class="w-full"
          />
        </UFormField>

        <UFormField label="What would make this feel indispensable to you?" name="q3">
          <UTextarea
            v-model="form.q3_indispensable"
            :rows="3"
            placeholder="Your ideal experience..."
            autoresize
            :maxrows="8"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="!user"
          label="Email (optional)"
          name="email"
        >
          <UInput
            v-model="form.email"
            type="email"
            placeholder="you@example.com"
            class="w-full"
          />
        </UFormField>

        <UCheckbox
          v-if="showAllowContact"
          v-model="allowContact"
          name="allow_contact"
          label="It's okay to reach out about this feedback"
          description="Uncheck if you prefer not to be contacted."
        />

        <p class="text-sm text-muted">
          All questions are optional—even a sentence helps.
        </p>

        <UButton
          type="submit"
          :loading="loading"
          :disabled="loading || !hasContent"
          icon="i-lucide-send"
        >
          Send
        </UButton>
      </form>
    </div>
  </div>
</template>
