<script setup lang="ts">
/**
 * Temporary stub — the `/internal` overview (analytics tiles, error feed,
 * reports) lands in Sprint 4 from Camera Shy. Exists so the sidebar's
 * Internal group and the `internal` middleware have a route to resolve.
 */
definePageMeta({
  layout: 'dashboard',
  middleware: 'internal'
})

useSeoMeta({ title: 'Internal' })
</script>

<template>
  <UDashboardPanel id="internal">
    <template #header>
      <UDashboardNavbar title="Internal">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UPageCard
        title="Overview lands in Sprint 4"
        description="Analytics tiles, the error feed and internal reports arrive with the analytics sprint. Dev Tools is live in the sidebar."
        icon="i-lucide-shield"
        variant="subtle"
      />
    </template>
  </UDashboardPanel>
</template>
