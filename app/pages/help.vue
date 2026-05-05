<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

useSeoMeta({
  title: 'Help center',
  description: 'Answers to common questions about Cosmo. Reach out if you need a hand.'
})

interface FaqItem {
  label: string
  defaultOpen?: boolean
  content: string
}

interface FaqCategory {
  id: string
  title: string
  description: string
  icon: string
  items: FaqItem[]
}

const categories: FaqCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    description: 'Sign up, sign in, and find your way around.',
    icon: 'i-lucide-rocket',
    items: [
      {
        label: 'How do I create an account?',
        defaultOpen: true,
        content: 'Visit the sign-up page, enter your email and a password, and confirm via the email we send. Your first sign-in drops you into onboarding to create or join an organization.'
      },
      {
        label: 'I never got the confirmation email — what now?',
        content: 'Check your spam folder first. If it is not there, request a new magic link from the sign-in page. Still nothing? Email us at the address below and we will sort it.'
      },
      {
        label: 'Can I use Cosmo with multiple teams?',
        content: 'Yes. Each team is a separate organization. Use the team switcher in the top-left of the app shell to move between them. Invitations from teammates land in your inbox.'
      }
    ]
  },
  {
    id: 'billing',
    title: 'Billing & plans',
    description: 'Subscriptions, invoices, and changing plans.',
    icon: 'i-lucide-credit-card',
    items: [
      {
        label: 'How do I upgrade my plan?',
        content: 'Open Settings, then Billing. Pick a plan and complete checkout. Your account flips to the new plan as soon as the payment clears.'
      },
      {
        label: 'How do I cancel?',
        content: 'In Settings, then Billing, click "Manage subscription" to open the customer portal. You can cancel from there. Your plan stays active through the end of the current billing period.'
      },
      {
        label: 'Where do I find invoices?',
        content: 'In the customer portal, accessible from Settings, then Billing. Every invoice is downloadable as PDF.'
      }
    ]
  },
  {
    id: 'data',
    title: 'Data & privacy',
    description: 'How your data is stored and who can see it.',
    icon: 'i-lucide-shield',
    items: [
      {
        label: 'Where is my data stored?',
        content: 'In Supabase Postgres, in the region your project is configured for. Row-level security restricts access to members of your organization.'
      },
      {
        label: 'How do I export my data?',
        content: 'Email us at the address below and we will send you a JSON dump of your organization\'s rows. A self-serve export is on the roadmap.'
      },
      {
        label: 'How do I delete my account?',
        content: 'Email us at the address below. Account deletion permanently removes your profile and revokes all org memberships. Org-level data is preserved unless you are the sole admin.'
      }
    ]
  }
]

const supportEmail = 'hello@example.com' // Project bootstrap step replaces this.
const supportSubject = encodeURIComponent('Help with Cosmo')
const mailtoHref = computed(() => `mailto:${supportEmail}?subject=${supportSubject}`)
</script>

<template>
  <UContainer class="py-16 sm:py-24">
    <div class="max-w-3xl mx-auto">
      <div class="text-center mb-12 sm:mb-16">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-primary mb-4">
          Help Center
        </p>
        <h1 class="text-4xl sm:text-5xl font-bold tracking-tight text-highlighted">
          How can we help?
        </h1>
        <p class="mt-4 text-lg text-muted max-w-xl mx-auto">
          Answers to the questions we get most often. Still stuck? Drop us a line.
        </p>
      </div>

      <div class="space-y-12">
        <section
          v-for="category in categories"
          :id="category.id"
          :key="category.id"
        >
          <div class="flex items-start gap-4 mb-6">
            <div class="flex size-10 items-center justify-center rounded-lg bg-elevated text-primary shrink-0">
              <UIcon :name="category.icon" class="size-5" />
            </div>
            <div>
              <h2 class="text-xl font-semibold text-highlighted">
                {{ category.title }}
              </h2>
              <p class="text-sm text-muted mt-1">
                {{ category.description }}
              </p>
            </div>
          </div>

          <UAccordion
            :items="category.items.map(item => ({
              label: item.label,
              content: item.content,
              defaultOpen: item.defaultOpen
            }))"
            class="border border-default rounded-lg divide-y divide-default"
          />
        </section>
      </div>

      <div class="mt-16 sm:mt-20 rounded-lg border border-default bg-elevated p-8 sm:p-10 text-center">
        <h2 class="text-2xl font-semibold tracking-tight text-highlighted">
          Still need help?
        </h2>
        <p class="mt-3 text-muted max-w-md mx-auto">
          We read every message. Tell us what is going on and we will get back to you within a business day.
        </p>
        <div class="mt-6">
          <UButton
            :to="mailtoHref"
            color="primary"
            size="lg"
            external
          >
            <UIcon name="i-lucide-mail" class="size-4 mr-2" />
            Email support
          </UButton>
        </div>
      </div>
    </div>
  </UContainer>
</template>
