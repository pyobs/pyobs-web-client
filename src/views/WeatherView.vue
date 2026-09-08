<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import { weatherSensorLabel } from '@/utils/weatherSensorLabel'
import TimeSeriesChart from '@/components/TimeSeriesChart.vue'

const HISTORY_LENGTH = 200 // matches pyobs-gui's own _HISTORY_LENGTH

type WeatherSensorReading = { sensor: string; value: number; unit: string; time: string }
type WeatherState = { good: boolean; readings: WeatherSensorReading[]; time: string }

// One tab on ModulePageView.vue now — see specs/plans/module-page-rework.md.
const props = defineProps<{ jid: string }>()
const { modules, subscribeState } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

// Bounded per-sensor history, keyed by sensor wire value — reset whenever the
// current module changes so a stale module's readings don't bleed into a
// freshly-selected one.
const history = ref<Record<string, { time: number; value: number }[]>>({})
const stateValue = ref<WeatherState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    history.value = {}
    stateValue.value = undefined

    if (!mod) return
    const version = mod.interfaces['IWeather']?.version
    if (version === undefined) return

    const { value, unsubscribe } = subscribeState(mod.jid, 'IWeather', version)

    const stopWatch = watch(
      value,
      (v) => {
        const state = v as WeatherState | undefined
        stateValue.value = state
        if (!state) return
        const next = { ...history.value }
        for (const reading of state.readings) {
          const series = next[reading.sensor] ? [...next[reading.sensor]!] : []
          series.push({ time: new Date(reading.time).getTime(), value: reading.value })
          next[reading.sensor] = series.slice(-HISTORY_LENGTH)
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
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-3">
    <div v-if="stateValue === undefined" class="text-muted" style="font-size:0.85rem">
      Waiting for state…
    </div>

    <template v-else>
      <div
        class="rounded-2 px-3 py-2 mb-1 fw-semibold"
        :class="stateValue.good ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger-emphasis'"
        style="font-size:0.85rem; width:fit-content"
      >
        <i :class="stateValue.good ? 'bi bi-check-circle' : 'bi bi-exclamation-triangle'" class="me-1"></i>
        Weather {{ stateValue.good ? 'OK' : 'BAD' }}
      </div>

      <div class="d-flex flex-wrap gap-2 mb-1">
        <div
          v-for="reading in stateValue.readings"
          :key="reading.sensor"
          class="pyobs-card"
          style="min-width:110px"
        >
          <div class="text-muted mb-1" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.03em">
            {{ weatherSensorLabel(reading.sensor) }}
          </div>
          <div class="text-light" style="font-size:1.1rem">
            {{ reading.value.toFixed(2) }}
            <span class="text-muted" style="font-size:0.8rem">{{ reading.unit }}</span>
          </div>
        </div>
      </div>

      <div class="d-flex flex-column gap-2">
        <div
          v-for="reading in stateValue.readings"
          :key="reading.sensor"
          class="pyobs-card"
        >
          <TimeSeriesChart
            :points="history[reading.sensor] ?? []"
            :label="weatherSensorLabel(reading.sensor)"
            :unit="reading.unit"
          />
        </div>
      </div>
    </template>
  </div>
</template>
