// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // `vue/no-multiple-template-root` is a Vue 2 rule: Vue 3 / Nuxt 4 SFCs
    // support fragment roots. Dashboard pages here intentionally render
    // a `UDashboardPanel` plus a sibling overlay (`UModal`/`USlideover`) as
    // separate template roots; wrapping them in a single element would risk the
    // dashboard flex layout. Disable the misapplied rule rather than restructure.
    'vue/no-multiple-template-root': 'off',
    'vue/max-attributes-per-line': ['error', { singleline: 3 }]
  }
})
