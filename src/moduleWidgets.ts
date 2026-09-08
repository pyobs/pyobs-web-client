import type { Component, DeepReadonly } from 'vue'
import type { PyobsModule } from '@/composables/useXmpp'
import { interfaceLabel } from '@/utils/interfaceLabel'
import RoofView from '@/views/RoofView.vue'
import ModeView from '@/views/ModeView.vue'
import WeatherView from '@/views/WeatherView.vue'
import AutoFocusView from '@/views/AutoFocusView.vue'
import AutoGuidingView from '@/views/AutoGuidingView.vue'
import AcquisitionView from '@/views/AcquisitionView.vue'
import CameraView from '@/views/CameraView.vue'
import TelescopeView from '@/views/TelescopeView.vue'
import CoolingView from '@/views/CoolingView.vue'
import FocuserView from '@/views/FocuserView.vue'
import FiltersView from '@/views/FiltersView.vue'
import TemperaturesView from '@/views/TemperaturesView.vue'

// The module-grouped drill-down's registry — see
// specs/plans/2026-09-06-module-page-rework.md. Resolves which widget component(s) a given
// MODULE renders (ModulePageView.vue, one tab per match), not which modules implement a given
// interface. Order matters — it's tab order on a multi-widget module, and (in AppLayout's
// desktop sidebar) which entry's icon wins for a module's single nav-list icon.
export type ModuleWidgetEntry = {
  interfaceName: string
  routeName: string
  label: string
  icon: string
  component: Component
  // Mirrors pyobs-gui's MainWidgetEntry.sidebar_preferred (mainwindow.py) — see
  // specs/design/pyobs-gui-widget-parity.md. An entry marked true is demoted into
  // ModulePageView.vue's shared section whenever the module has at least one non-preferred
  // match (e.g. a camera that's also a filter wheel); promoted back to a normal tab only when
  // it's the module's *only* kind of match (a standalone filter-wheel-only module).
  sidebarPreferred?: boolean
}

export const MODULE_WIDGETS: ModuleWidgetEntry[] = [
  { interfaceName: 'IRoof', routeName: 'roof', label: interfaceLabel('IRoof'), icon: 'bi-house-door', component: RoofView },
  { interfaceName: 'ICamera', routeName: 'camera', label: interfaceLabel('ICamera'), icon: 'bi-camera', component: CameraView },
  { interfaceName: 'IMode', routeName: 'mode', label: interfaceLabel('IMode'), icon: 'bi-sliders', component: ModeView },
  { interfaceName: 'IWeather', routeName: 'weather', label: interfaceLabel('IWeather'), icon: 'bi-cloud-sun', component: WeatherView },
  { interfaceName: 'IAutoFocus', routeName: 'autofocus', label: interfaceLabel('IAutoFocus'), icon: 'bi-bullseye', component: AutoFocusView },
  { interfaceName: 'IAutoGuiding', routeName: 'autoguiding', label: interfaceLabel('IAutoGuiding'), icon: 'bi-compass', component: AutoGuidingView },
  { interfaceName: 'IAcquisition', routeName: 'acquisition', label: interfaceLabel('IAcquisition'), icon: 'bi-crosshair', component: AcquisitionView },
  { interfaceName: 'ITelescope', routeName: 'telescope', label: interfaceLabel('ITelescope'), icon: 'bi-stars', component: TelescopeView },
  {
    interfaceName: 'ICooling',
    routeName: 'cooling',
    label: interfaceLabel('ICooling'),
    icon: 'bi-snow',
    component: CoolingView,
    sidebarPreferred: true,
  },
  {
    interfaceName: 'IFocuser',
    routeName: 'focuser',
    label: interfaceLabel('IFocuser'),
    icon: 'bi-record-circle',
    component: FocuserView,
    sidebarPreferred: true,
  },
  {
    interfaceName: 'IFilters',
    routeName: 'filters',
    label: interfaceLabel('IFilters'),
    icon: 'bi-filter',
    component: FiltersView,
    sidebarPreferred: true,
  },
  {
    interfaceName: 'ITemperatures',
    routeName: 'temperatures',
    label: interfaceLabel('ITemperatures'),
    icon: 'bi-thermometer-half',
    component: TemperaturesView,
    sidebarPreferred: true,
  },
]

function matchesForModule(mod: DeepReadonly<Pick<PyobsModule, 'interfaces'>>): ModuleWidgetEntry[] {
  return MODULE_WIDGETS.filter((entry) => entry.interfaceName in mod.interfaces)
}

// Tab-bar matches, in registry order — order is tab order on ModulePageView, and the first
// match's icon is what a module's single desktop-sidebar nav entry shows. Applies pyobs-gui's
// promotion rule (collect_main_widgets, mainwindow.py): non-`sidebarPreferred` matches win when
// any exist; only when there are none does every `sidebarPreferred` match get promoted into the
// tab bar instead (a standalone cooling/filter/temperature/focuser-only module still needs its
// own page).
export function widgetsForModule(mod: DeepReadonly<Pick<PyobsModule, 'interfaces'>>): ModuleWidgetEntry[] {
  const matches = matchesForModule(mod)
  const main = matches.filter((entry) => !entry.sidebarPreferred)
  return main.length > 0 ? main : matches.filter((entry) => entry.sidebarPreferred)
}

// The `sidebarPreferred` matches demoted out of the tab bar by the promotion rule above — rendered
// in ModulePageView.vue's shared section, visible regardless of which tab is active. Empty
// whenever every match was promoted into the tab bar instead (no demotion happened).
export function sidebarWidgetsForModule(mod: DeepReadonly<Pick<PyobsModule, 'interfaces'>>): ModuleWidgetEntry[] {
  const matches = matchesForModule(mod)
  const main = matches.filter((entry) => !entry.sidebarPreferred)
  return main.length > 0 ? matches.filter((entry) => entry.sidebarPreferred) : []
}
