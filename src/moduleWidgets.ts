import type { Component } from 'vue'
import type { PyobsModule } from '@/composables/useXmpp'
import { interfaceLabel } from '@/utils/interfaceLabel'
import RoofView from '@/views/RoofView.vue'
import ModeView from '@/views/ModeView.vue'
import WeatherView from '@/views/WeatherView.vue'
import AutoFocusView from '@/views/AutoFocusView.vue'
import AutoGuidingView from '@/views/AutoGuidingView.vue'
import AcquisitionView from '@/views/AcquisitionView.vue'
import CameraView from '@/views/CameraView.vue'

// The module-grouped drill-down's registry — see specs/plans/module-page-rework.md. Replaces
// useModuleNavSections.ts's per-interface nav grouping: this resolves which widget component(s)
// a given MODULE renders (ModulePageView.vue, one tab per match), not which modules implement a
// given interface. Order matters — it's tab order on a multi-widget module, and (in AppLayout's
// desktop sidebar) which entry's icon wins for a module's single nav-list icon.
export type ModuleWidgetEntry = {
  interfaceName: string
  routeName: string
  label: string
  icon: string
  component: Component
}

export const MODULE_WIDGETS: ModuleWidgetEntry[] = [
  { interfaceName: 'IRoof', routeName: 'roof', label: interfaceLabel('IRoof'), icon: 'bi-house-door', component: RoofView },
  { interfaceName: 'ICamera', routeName: 'camera', label: interfaceLabel('ICamera'), icon: 'bi-camera', component: CameraView },
  { interfaceName: 'IMode', routeName: 'mode', label: interfaceLabel('IMode'), icon: 'bi-sliders', component: ModeView },
  { interfaceName: 'IWeather', routeName: 'weather', label: interfaceLabel('IWeather'), icon: 'bi-cloud-sun', component: WeatherView },
  { interfaceName: 'IAutoFocus', routeName: 'autofocus', label: interfaceLabel('IAutoFocus'), icon: 'bi-bullseye', component: AutoFocusView },
  { interfaceName: 'IAutoGuiding', routeName: 'autoguiding', label: interfaceLabel('IAutoGuiding'), icon: 'bi-compass', component: AutoGuidingView },
  { interfaceName: 'IAcquisition', routeName: 'acquisition', label: interfaceLabel('IAcquisition'), icon: 'bi-crosshair', component: AcquisitionView },
]

// Matches in registry order — order is tab order on ModulePageView, and the first match's icon
// is what a module's single desktop-sidebar nav entry shows.
export function widgetsForModule(mod: Pick<PyobsModule, 'interfaces'>): ModuleWidgetEntry[] {
  return MODULE_WIDGETS.filter((entry) => entry.interfaceName in mod.interfaces)
}
