<script setup lang="ts">
const columns = [{
  label: 'Product',
  children: [{
    label: 'Pricing',
    to: '/pricing'
  }, {
    label: 'Changelog',
    to: '/changelog'
  }, {
    label: 'Blog',
    to: '/blog'
  }]
}, {
  label: 'Resources',
  children: [{
    label: 'Documentation',
    to: '/docs'
  }, {
    label: 'Getting started',
    to: '/docs/getting-started'
  }, {
    label: 'Help center',
    to: '/help'
  }]
}, {
  label: 'Account',
  children: [{
    label: 'Sign in',
    to: '/auth/login'
  }, {
    label: 'Request access',
    to: '/auth/signup'
  }]
}]
</script>

<template>
  <USeparator
    icon="i-lucide-shield"
    class="h-px"
  />

  <UFooter :ui="{ top: 'border-b border-default' }">
    <template #top>
      <UContainer>
        <UFooterColumns :columns="columns" />
      </UContainer>
    </template>

    <template #left>
      <p class="text-muted text-sm">
        {{ SITE.name }} &copy; {{ new Date().getFullYear() }}
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
        icon="i-lucide-life-buoy"
        aria-label="Help"
        color="neutral"
        variant="ghost"
        to="/help"
      />
    </template>
  </UFooter>
</template>
