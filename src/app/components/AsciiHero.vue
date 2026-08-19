<script setup lang="ts">
const asciiOutput = ref('')
const containerRef = ref<HTMLElement | null>(null)
const appeared = ref(false)

let animationId: number | null = null
let A = 0
let B = 0.8 // fixed tilt — gives a nice 3/4 view

const charRamp = ' .,-~:;=!*#$@'

// 2.3 — Responsive sizing via useResizeObserver
const cols = ref(80)
const rows = ref(40)

useResizeObserver(containerRef, (entries) => {
  const width = entries[0]?.contentRect.width ?? 800
  if (width > 768) {
    cols.value = 80
    rows.value = 40
  } else if (width > 480) {
    cols.value = 60
    rows.value = 30
  } else {
    cols.value = 40
    rows.value = 20
  }
})

// 2.4 — Reduced motion
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

function renderFrame() {
  const c = cols.value
  const r = rows.value
  const output = new Array(c * r).fill(0)
  const zbuffer = new Array(c * r).fill(0)

  const R1 = 1 // tube radius
  const R2 = 2 // distance from center to tube center
  const K2 = 5 // distance from viewer
  const K1 = c * K2 * 3 / (8 * (R1 + R2)) // scale factor

  const cosA = Math.cos(A)
  const sinA = Math.sin(A)
  const cosB = Math.cos(B)
  const sinB = Math.sin(B)

  // theta goes around the tube cross-section
  for (let theta = 0; theta < 6.28; theta += 0.07) {
    const cosTheta = Math.cos(theta)
    const sinTheta = Math.sin(theta)

    // phi goes around the torus
    for (let phi = 0; phi < 6.28; phi += 0.02) {
      const cosPhi = Math.cos(phi)
      const sinPhi = Math.sin(phi)

      // 3D coordinates of point on torus surface
      const circleX = R2 + R1 * cosTheta
      const circleY = R1 * sinTheta

      // 3D position after rotation
      const x = circleX * (cosB * cosPhi + sinA * sinB * sinPhi) - circleY * cosA * sinB
      const y = circleX * (sinB * cosPhi - sinA * cosB * sinPhi) + circleY * cosA * cosB
      const z = K2 + cosA * circleX * sinPhi + circleY * sinA
      const ooz = 1 / z // one over z

      // project to 2D
      const xp = Math.floor(c / 2 + K1 * ooz * x)
      const yp = Math.floor(r / 2 - K1 * ooz * y * 0.5) // 0.5 for char aspect ratio

      if (xp < 0 || xp >= c || yp < 0 || yp >= r) continue

      const idx = xp + yp * c

      // luminance from surface normal dot light direction
      const L = cosPhi * cosTheta * sinB
        - cosA * cosTheta * sinPhi
        - sinA * sinTheta
        + cosB * (cosA * sinTheta - cosTheta * sinA * sinPhi)

      if (L > 0 && ooz > zbuffer[idx]) {
        zbuffer[idx] = ooz
        const luminanceIndex = Math.min(Math.floor(L * 8), charRamp.length - 2) + 1
        output[idx] = luminanceIndex
      }
    }
  }

  // Build string
  let result = ''
  for (let j = 0; j < r; j++) {
    for (let i = 0; i < c; i++) {
      result += charRamp[output[j * c + i]] || ' '
    }
    if (j < r - 1) result += '\n'
  }

  asciiOutput.value = result
  A += 0.01
  // B stays fixed — single axis, slow graceful rotation

  // 2.4 — If reduced motion, render one frame and stop
  if (!prefersReducedMotion.value) {
    animationId = requestAnimationFrame(renderFrame)
  }
}

onMounted(() => {
  // Start rendering immediately (spins while fading in)
  renderFrame()

  // 2.1 — Trigger fade-in on next tick
  nextTick(() => {
    appeared.value = true
  })
})

onUnmounted(() => {
  if (animationId !== null) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
})
</script>

<template>
  <div class="relative">
    <UPageCard
      variant="subtle"
      class="rounded-2xl"
    >
      <div
        ref="containerRef"
        class="ascii-hero-container relative overflow-hidden rounded-xl bg-zinc-950 aspect-video flex items-center justify-center transition-opacity duration-1000"
        :class="appeared ? 'opacity-100' : 'opacity-0'"
      >
        <!-- Scanline grid overlay -->
        <div
          class="absolute inset-0 opacity-[0.08]"
          :style="{ backgroundImage: 'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)', backgroundSize: '48px 48px' }"
        />

        <!-- Corner brackets -->
        <div class="absolute top-4 left-4 w-5 h-5 border-t border-l border-white/20" />
        <div class="absolute top-4 right-4 w-5 h-5 border-t border-r border-white/20" />
        <div class="absolute bottom-4 left-4 w-5 h-5 border-b border-l border-white/20" />
        <div class="absolute bottom-4 right-4 w-5 h-5 border-b border-r border-white/20" />

        <!-- 2.5 — CRT scanline overlay -->
        <div class="ascii-scanlines absolute inset-0 pointer-events-none" />

        <!-- ASCII donut with 2.2 glow -->
        <pre class="ascii-glow text-zinc-400 text-[0.55rem] sm:text-[0.65rem] md:text-xs leading-[1.1] font-mono select-none pointer-events-none">{{ asciiOutput }}</pre>

        <!-- Overlay text -->
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="relative text-center px-6 py-3 bg-zinc-950/60 backdrop-blur-sm rounded-lg">
            <div class="text-xs tracking-[0.3em] uppercase text-white/50 mb-1">
              AEGIS Command Interface
            </div>
            <div class="text-[10px] tracking-[0.25em] uppercase text-white/25">
              Fleet Operations Dashboard v1.0
            </div>
          </div>
        </div>
      </div>
    </UPageCard>
  </div>
</template>

<style scoped>
/* 2.2 — Subtle monochrome glow */
.ascii-glow {
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.15);
}

/* 2.5 — CRT scanline overlay */
.ascii-scanlines {
  background: repeating-linear-gradient(
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.1) 2px,
    rgba(0, 0, 0, 0.1) 4px
  );
}
</style>
