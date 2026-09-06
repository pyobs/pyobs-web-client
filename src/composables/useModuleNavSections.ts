import { computed } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import { interfaceLabel } from '@/utils/interfaceLabel'

// Extracted from AppLayout.vue so the compact shell's "More" list (every
// per-interface page not on a primary tab) can reuse the same one-entry-vs-
// section-with-sub-links grouping as the desktop sidebar, instead of a
// second copy of this logic. See specs/design/interface-nav-per-module-routes.md.
const NAV_INTERFACES = [
  { interfaceName: 'IRoof', icon: 'bi-house-door' },
  { interfaceName: 'ICamera', icon: 'bi-camera' },
  { interfaceName: 'IMode', icon: 'bi-sliders' },
  { interfaceName: 'IWeather', icon: 'bi-cloud-sun' },
  { interfaceName: 'IAutoFocus', icon: 'bi-bullseye' },
  { interfaceName: 'IAutoGuiding', icon: 'bi-compass' },
  { interfaceName: 'IAcquisition', icon: 'bi-crosshair' },
] as const

export function useModuleNavSections() {
  const { modules } = useXmpp()

  const navSections = computed(() =>
    NAV_INTERFACES.map(({ interfaceName, icon }) => ({
      interfaceName,
      icon,
      routeName: interfaceName.slice(1).toLowerCase(),
      label: interfaceLabel(interfaceName),
      modules: modules.value
        .filter((m) => interfaceName in m.interfaces)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((section) => section.modules.length > 0),
  )

  return { navSections }
}
