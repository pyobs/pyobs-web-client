import { ref, computed, watch } from 'vue'

const THEME_KEY = 'pyobs-theme'

type ThemeMode = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

function loadStoredMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

const mode = ref<ThemeMode>(loadStoredMode())

// 'system' has no stored key at all — indistinguishable from a first-ever
// visit, and by design: it means "keep following the OS", same convention as
// the Django apps' inline theme script.
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
const systemPrefersDark = ref(mediaQuery.matches)
mediaQuery.addEventListener('change', (e) => {
  systemPrefersDark.value = e.matches
})

const resolvedTheme = computed<ResolvedTheme>(() =>
  mode.value === 'system' ? (systemPrefersDark.value ? 'dark' : 'light') : mode.value,
)

// Idempotent with index.html's inline pre-paint script — this just keeps the
// attribute in sync once the app is interactive (theme cycling, live OS changes).
watch(
  resolvedTheme,
  (theme) => {
    document.documentElement.setAttribute('data-bs-theme', theme)
  },
  { immediate: true },
)

export function useTheme() {
  function cycleTheme(): void {
    const next: ThemeMode = mode.value === 'light' ? 'dark' : mode.value === 'dark' ? 'system' : 'light'
    mode.value = next
    if (next === 'system') {
      localStorage.removeItem(THEME_KEY)
    } else {
      localStorage.setItem(THEME_KEY, next)
    }
  }

  const themeIcon = computed(() => {
    if (mode.value === 'system') return 'bi-circle-half'
    return resolvedTheme.value === 'dark' ? 'bi-moon-stars-fill' : 'bi-sun-fill'
  })

  const themeLabel = computed(() => {
    if (mode.value === 'system') return 'Theme: System'
    return mode.value === 'dark' ? 'Theme: Dark' : 'Theme: Light'
  })

  return { mode, resolvedTheme, cycleTheme, themeIcon, themeLabel }
}
