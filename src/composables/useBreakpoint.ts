import { ref, computed } from 'vue'

// Matches this app's existing Bootstrap `lg` breakpoint (main.css's own
// `@media (max-width: 991.98px)` mobile-layout rule) — one threshold, so
// this JS-driven branching and the desktop sidebar's own CSS agree on
// where "compact" starts, instead of introducing a second number.
const COMPACT_MAX_WIDTH = 991.98

const width = ref(window.innerWidth)
window.addEventListener('resize', () => {
  width.value = window.innerWidth
})

export function useBreakpoint() {
  const isCompact = computed(() => width.value <= COMPACT_MAX_WIDTH)
  return { isCompact }
}
