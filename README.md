# AEGIS

Fleet Command Operations Platform — a showcase/template SaaS application built with Nuxt 4 and Nuxt UI.

AEGIS is a themed starter template for building production-ready SaaS applications. It uses a fictional space navy operations platform as its product identity, giving the template a cohesive design language while demonstrating real patterns and components.

## Stack

- **Framework:** [Nuxt 4](https://nuxt.com)
- **UI:** [Nuxt UI](https://ui.nuxt.com) (100+ components)
- **Styling:** Tailwind CSS 4 with custom monochrome theme
- **Content:** [Nuxt Content](https://content.nuxt.com) (Markdown/YAML-driven pages)
- **Editor:** TipTap with collaboration support
- **AI:** Vercel AI SDK + OpenAI
- **Database:** Supabase
- **Job Queue:** Inngest

## What's Included

**Marketing site:**
- Landing page with hero, features, testimonials, and CTA
- Pricing page with plan comparison and FAQ
- Blog (Fleet Dispatch) with MDC-powered articles
- Documentation site
- Changelog

**Dashboard application:**
- Command overview with stats, charts, and operations log
- Comms inbox with message detail view
- Personnel management with data tables, filtering, and bulk actions
- AI Ops chat assistant with streaming and tool calls
- Rich text editor with slash commands and collaboration
- Settings (general, members, notifications, security)

**Auth flows:**
- Login and signup pages with OAuth provider support

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Fill in your Supabase, OpenAI, and Inngest keys

# Start dev server
npm run dev
```

## Theme

Monochrome black/white color scheme with manually pinned CSS custom properties. Primary color maps to near-black in light mode and near-white in dark mode. All UI tokens are set explicitly in `app/assets/css/main.css` — no reliance on generated variable chains.

## License

MIT
