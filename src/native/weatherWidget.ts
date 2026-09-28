import { Capacitor, registerPlugin } from '@capacitor/core'
import type { LinkedAppsStore } from '@/composables/useLinkedApps'

// Bridge to the Android home-screen weather widgets (android/app/src/main/java/org/pyobs/app/weather,
// specs/plans/2026-09-28-android-weather-widget.md). Widgets are drawn by the launcher and can't
// read the WebView's localStorage, so the app hands them the list of pyobs-weather instances.
export type WeatherInstance = { url: string; label: string }

interface WeatherWidgetPlugin {
  setInstances(options: { instances: WeatherInstance[] }): Promise<void>
}

const WeatherWidget = registerPlugin<WeatherWidgetPlugin>('WeatherWidget')

// Same instance reached via two accounts (or typed with/without a trailing slash) is one widget
// entry. Instances are keyed by this everywhere on the native side too.
export function normalizeInstanceUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return url.trim().replace(/\/+$/, '')
  }
}

// Every `kind: 'weather'` link across all accounts on this device, first label wins on duplicates.
export function weatherInstances(store: LinkedAppsStore): WeatherInstance[] {
  const byUrl = new Map<string, WeatherInstance>()
  for (const apps of Object.values(store)) {
    for (const app of apps) {
      if (app.kind !== 'weather') continue
      const url = normalizeInstanceUrl(app.url)
      if (!byUrl.has(url)) byUrl.set(url, { url, label: app.label })
    }
  }
  return [...byUrl.values()]
}

export async function syncWeatherInstances(store: LinkedAppsStore): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return
  try {
    await WeatherWidget.setInstances({ instances: weatherInstances(store) })
  } catch (e) {
    // Widgets just keep their last list; nothing in the app depends on this succeeding.
    console.warn('WeatherWidget.setInstances failed', e)
  }
}
