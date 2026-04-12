<script setup lang="ts">
const columns = [{
  label: 'Operations',
  children: [{
    label: 'Fleet Status'
  }, {
    label: 'Mission Planning'
  }, {
    label: 'Crew Assignments'
  }, {
    label: 'Sensor Data'
  }]
}, {
  label: 'Support',
  children: [{
    label: 'Help Center'
  }, {
    label: 'Documentation'
  }, {
    label: 'Training'
  }, {
    label: 'API Reference'
  }]
}, {
  label: 'Organization',
  children: [{
    label: 'About'
  }, {
    label: 'Careers'
  }, {
    label: 'Contact'
  }, {
    label: 'Partners'
  }]
}]

const toast = useToast()

const email = ref('')
const loading = ref(false)

function onSubmit() {
  loading.value = true

  toast.add({
    title: 'Subscribed!',
    description: 'You\'ve been added to fleet briefings.'
  })
}
</script>

<template>
  <USeparator
    icon="i-lucide-shield"
    class="h-px"
  />

  <UFooter :ui="{ top: 'border-b border-default' }">
    <template #top>
      <UContainer>
        <UFooterColumns :columns="columns">
          <template #right>
            <form @submit.prevent="onSubmit">
              <UFormField
                name="email"
                label="Subscribe to fleet briefings"
                size="lg"
              >
                <UInput
                  v-model="email"
                  type="email"
                  class="w-full"
                  placeholder="Enter your email"
                >
                  <template #trailing>
                    <UButton
                      type="submit"
                      size="xs"
                      color="neutral"
                      label="Subscribe"
                    />
                  </template>
                </UInput>
              </UFormField>
            </form>
          </template>
        </UFooterColumns>
      </UContainer>
    </template>

    <template #left>
      <p class="text-muted text-sm">
        AEGIS Fleet Operations &copy; {{ new Date().getFullYear() }}
      </p>
    </template>

    <template #right>
      <UButton
        icon="i-lucide-book-open"
        aria-label="Documentation"
        color="neutral"
        variant="ghost"
        to="/docs"
      />
      <UButton
        icon="i-lucide-message-circle"
        aria-label="Support"
        color="neutral"
        variant="ghost"
      />
    </template>
  </UFooter>
</template>
