<template>
  <div class="relative">
    <UPageCard
      variant="subtle"
      class="rounded-2xl"
    >
      <div class="relative overflow-hidden rounded-xl bg-zinc-950 aspect-video flex items-center justify-center">
        <div
          class="absolute inset-0 opacity-[0.08]"
          :style="{ backgroundImage: 'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)', backgroundSize: '48px 48px' }"
        />

        <div class="absolute top-4 left-4 w-5 h-5 border-t border-l border-white/20" />
        <div class="absolute top-4 right-4 w-5 h-5 border-t border-r border-white/20" />
        <div class="absolute bottom-4 left-4 w-5 h-5 border-b border-l border-white/20" />
        <div class="absolute bottom-4 right-4 w-5 h-5 border-b border-r border-white/20" />

        <div class="relative text-center">
          <div class="text-xs tracking-[0.3em] uppercase text-white/50 mb-1">
            AEGIS Command Interface
          </div>
          <div class="text-[10px] tracking-[0.25em] uppercase text-white/25">
            Fleet Operations Dashboard v1.0
          </div>
        </div>
      </div>
    </UPageCard>
  </div>
</template>
