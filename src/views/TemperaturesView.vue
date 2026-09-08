<script setup lang="ts">
// ITemperatures shared-section widget — see pyobs_gui/temperatureswidget.py
// and specs/plans/2026-08-04-auxiliary-interface-widgets.md. Read-only.
// Rendered in ModulePageView.vue's shared section when demoted
// (sidebarPreferred, a module also implementing a primary interface), or as
// its own tab when promoted (a standalone temperature-sensor-only module —
// see moduleWidgets.ts). Reuses WeatherView.vue's per-sensor tile +
// bounded-history-array + TimeSeriesChart pattern, per this plan's own note.
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import TimeSeriesChart from '@/components/TimeSeriesChart.vue'

const HISTORY_LENGTH = 200 // matches pyobs-gui's own _HISTORY_LENGTH

type SensorReading = { name: string; value: number | null }
type TemperaturesState = { readings: SensorReading[] }

const props = defineProps<{ jid: string }>()
const { modules, subscribeState } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

// Bounded per-sensor history, keyed by sensor name — reset whenever the
// current module changes so a stale module's readings don't bleed into a
// freshly-selected one.
const history = ref<Record<string, { time: number; value: number }[]>>({})
const stateValue = ref<TemperaturesState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    history.value = {}
    stateValue.value = undefined

    if (!mod) return
    const version = mod.interfaces['ITemperatures']?.version
    if (version === undefined) return

    const { value, unsubscribe } = subscribeState(mod.jid, 'ITemperatures', version)

    const stopWatch = watch(
      value,
      (v) => {
        const state = v as TemperaturesState | undefined
        stateValue.value = state
        if (!state) return
        const now = Date.now()
        const next = { ...history.value }
        for (const reading of state.readings) {
          if (reading.value === null) continue
          const series = next[reading.name] ? [...next[reading.name]!] : []
          series.push({ time: now, value: reading.value })
          next[reading.name] = series.slice(-HISTORY_LENGTH)
        }
        history.value = next
      },
      { immediate: true },
    )
    stopSubscription = () => {
      stopWatch()
      unsubscribe()
    }
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

// temperatureswidget.py's own display order: alphabetical by sensor name.
const sortedReadings = computed(() => [...(stateValue.value?.readings ?? [])].sort((a, b) => a.name.localeCompare(b.name)))
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-3">
    <div v-if="stateValue === undefined" class="text-muted" style="font-size:0.85rem">Waiting for state…</div>

    <template v-else>
      <div class="mb-1" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(90px, 1fr)); gap:0.5rem">
        <div v-for="reading in sortedReadings" :key="reading.name" class="pyobs-card">
          <div class="text-muted mb-1" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.03em">
            {{ reading.name }}
          </div>
          <div class="text-light" style="font-size:1.1rem">
            {{ reading.value === null ? 'N/A' : reading.value.toFixed(2) }}
            <span v-if="reading.value !== null" class="text-muted" style="font-size:0.8rem">°C</span>
          </div>
        </div>
      </div>

      <div class="d-flex flex-column gap-2">
        <div v-for="reading in sortedReadings" :key="reading.name" class="pyobs-card">
          <TimeSeriesChart :points="history[reading.name] ?? []" :label="reading.name" unit="°C" />
        </div>
      </div>
    </template>
  </div>
</template>
