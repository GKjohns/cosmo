# ASCII Art Hero Effect — Implementation Plan

**Created:** April 12, 2026
**Status:** Complete
**Context:** Inspired by asciistudio.space — animated ASCII character effects with color cycling and depth via character density. The AEGIS space navy theme is a perfect match for a retro-futuristic ASCII terminal aesthetic.

**Goal:** Replace the static `PromotionalVideo` placeholder in the hero with a live, animated ASCII art canvas that renders a slowly rotating 3D wireframe shape (or starfield) using monospaced ASCII characters, fitting the monochrome theme.

**Scope:** New `AsciiHero` component using a `<canvas>` element, rendered as ASCII text. Replaces the `PromotionalVideo` component slot in the hero. Respects dark/light mode. No external dependencies — pure Canvas 2D API + monospace font rendering.

---

## Current State

### What Exists
- `app/components/PromotionalVideo.vue` — static placeholder card with grid overlay, corner brackets, and centered text ("AEGIS Command Interface"). Aspect-video ratio, dark bg.
- `app/components/HeroBackground.vue` — SVG gradient fade-in above the hero
- `app/components/StarsBg.vue` — CSS-based rising star particles (used in CTA section, not hero)
- `app/pages/index.vue` — hero renders `<PromotionalVideo />` in the default slot of `<UPageHero>`
- Monochrome theme: dark mode primary is `#fafafa`, bg is `#09090b`. Light mode primary is `#09090b`.
- Font: Public Sans (sans-serif) — we'll use a monospace font for the ASCII canvas only.

### What Changes
- New `app/components/AsciiHero.vue` component — canvas-based ASCII renderer
- `app/pages/index.vue` — swap `<PromotionalVideo />` for `<AsciiHero />`
- `PromotionalVideo.vue` — left in place (not deleted), just no longer referenced from index

### What Stays
- `HeroBackground.vue` — gradient stays as-is (layered above)
- `StarsBg.vue` — untouched (separate CTA section)
- All page content, sections, testimonials, CTA — untouched
- Hero text/CTAs from `0.index.yml` — untouched

---

## Architecture

```
index.vue
  └── UPageHero
       ├── #top → HeroBackground (SVG gradient, unchanged)
       ├── #title → MDC title text
       ├── #default → AsciiHero (NEW — replaces PromotionalVideo)
       └── hero.links → CTA buttons
```

`AsciiHero.vue` internals:
```
<canvas> (offscreen render) → ASCII character mapping → <pre> DOM output
   │                              │
   │  3D wireframe torus/sphere   │  Map brightness → character density
   │  rendered to canvas pixels   │  ░▒▓█ or .:-=+*#%@
   │  at low resolution           │
   └──────────────────────────────┘
         ↓
   Monospace <pre> block inside the existing
   UPageCard > aspect-video container
   with the corner brackets preserved
```

**Approach:** Render a 3D rotating wireframe to a small hidden canvas (e.g. 80x40 chars), sample pixel brightness, map to ASCII characters, display as a `<pre>` block updated at ~15fps via `requestAnimationFrame`. This is the classic "ASCII renderer" technique — no WebGL needed, pure Canvas 2D.

---

## Sprint Breakdown

### Sprint 1: Core ASCII Renderer [Complete]
**Goal:** Working `AsciiHero.vue` component that renders an animated ASCII art scene in the hero slot.
**Estimated effort:** 2-3 hours

#### Tasks
- 1.1 Create `app/components/AsciiHero.vue`
  - Hidden `<canvas>` element (offscreen, not displayed)
  - Visible `<pre>` element for ASCII output
  - Canvas renders a slowly rotating 3D torus or sphere using basic 3D math (sin/cos projection) — no library needed
  - Sample canvas pixels at character-cell intervals, map luminance to character ramp: ` .:-=+*#%@`
  - Update at ~15fps via `requestAnimationFrame`
  - Wrap in the same card/container style as PromotionalVideo (UPageCard subtle, rounded-2xl, aspect-video, dark bg, corner brackets)
  - Add overlay text: "AEGIS Command Interface" + "Fleet Operations Dashboard v1.0" (keep the PromotionalVideo's text, now floating over the ASCII art)
- 1.2 Wire into `app/pages/index.vue`
  - Replace `<PromotionalVideo />` with `<AsciiHero />`
- 1.3 Theme integration
  - Dark mode: light characters (`#fafafa` / `text-primary`) on dark bg (`#09090b`)
  - Light mode: dark characters (`#09090b`) on light bg — or keep dark bg always (the PromotionalVideo already forces `bg-zinc-950`)
  - Use CSS `font-family: monospace` with small font-size and tight line-height for the `<pre>` block
- 1.4 Performance
  - `onUnmounted` — cancel animation frame
  - Use `will-change: contents` on the pre element
  - Keep canvas resolution low (80x40 or similar) — ASCII art doesn't need resolution

#### Verification
- [x] `npm run dev` — hero shows animated ASCII art where the static placeholder was
- [x] Animation is smooth (~15fps), no jank
- [x] Dark mode: readable characters on dark bg
- [x] Light mode: still looks good (dark bg card is fine)
- [x] Corner brackets and overlay text still visible
- [x] No console errors, no memory leaks on navigation
- [x] Rest of the page (sections, testimonials, CTA) unaffected

**Status notes:** Typecheck passes for new code (pre-existing errors in ai.vue and HomeStats.vue unrelated). Dev server runs clean. Classic donut.c math with z-buffer, 80x40 grid, 12-level character ramp.

---

### Sprint 2: Polish & Effects [Complete]
**Goal:** Add visual polish — fade-in on mount, subtle glow/color effects, responsive sizing.
**Estimated effort:** 1-2 hours

#### Tasks
- 2.1 Fade-in on mount
  - ASCII art fades in over ~1s (opacity transition), synchronized with HeroBackground's existing fade-in timing
- 2.2 Subtle glow effect
  - Add a faint `text-shadow` glow on the ASCII characters (monochrome — white glow in dark mode)
  - Keep it subtle — this is monochrome, not rainbow
- 2.3 Responsive sizing
  - Adjust character grid size based on container width (fewer columns on mobile)
  - Use `useResizeObserver` from VueUse (already a dependency) to react to container size
- 2.4 Reduced motion
  - Respect `prefers-reduced-motion` — if set, show a static ASCII frame instead of animating
- 2.5 Optional: scanline overlay
  - Faint CSS scanline effect (repeating-linear-gradient) over the ASCII block for a CRT terminal feel — fits the fleet command aesthetic

#### Verification
- [x] Fade-in looks smooth and timed with the hero gradient
- [x] Glow is subtle, not overpowering
- [x] Resize browser — ASCII grid adapts, no overflow or clipping
- [x] Mobile viewport (~375px) — still looks intentional, not broken
- [x] `prefers-reduced-motion` — animation stops, static frame shown
- [x] Scanline effect is barely noticeable but adds texture

**Deviation from plan:** Post-sprint, user requested slower, more graceful rotation. Changed from dual-axis (A += 0.04, B += 0.02) to single-axis (A += 0.01, B fixed at 0.8 tilt). Much more elegant.

---

## What's Deferred / Out of Scope
- Interactive ASCII (mouse/hover effects like asciistudio.space's "Special ASCII" mode) — cool but unnecessary for a hero
- Color cycling / rainbow effects — doesn't fit the monochrome theme
- Image-to-ASCII conversion — we're rendering 3D math, not processing photos
- WebGL — overkill, Canvas 2D is sufficient

## Open Questions
1. **Shape preference?** Torus (donut) is the classic ASCII demo. Could also do a rotating globe/sphere, a wireframe cube, or a starfield tunnel. Will default to torus — it's iconic and immediately recognizable as "cool ASCII art."
