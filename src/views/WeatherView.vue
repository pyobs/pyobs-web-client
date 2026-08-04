<script setup lang="ts">
import { ref, computed, watch, watchEffect, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useXmpp } from '@/composables/useXmpp'
import { weatherSensorLabel } from '@/utils/weatherSensorLabel'
import TimeSeriesChart from '@/components/TimeSeriesChart.vue'

const HISTORY_LENGTH = 200 // matches pyobs-gui's own _HISTORY_LENGTH

type WeatherSensorReading = { sensor: string; value: number; unit: string; time: string }
type WeatherState = { good: boolean; readings: WeatherSensorReading[]; time: string }

const route = useRoute()
const router = useRouter()
const { modules, subscribeState } = useXmpp()

const weatherModules = computed(() =>
  modules.value.filter((m) => 'IWeather' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)

const routeJid = computed(() => route.params.jid as string | undefined)

const currentModule = computed(() =>
  routeJid.value ? weatherModules.value.find((m) => m.jid === routeJid.value) : undefined,
)

// No :jid in the URL: redirect to the first online module (alphabetical), so
// the single-instance case stays a one-click nav hit with no picker step. If
// a module goes offline while its page is open, we stay put and fall through
// to the "not online" empty state below instead of forcing a navigation.
watchEffect(() => {
  if (!routeJid.value && weatherModules.value.length > 0) {
    router.replace({ name: 'weather', params: { jid: weatherModules.value[0]!.jid } })
  }
})

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
  <div style="max-width: 800px">
    <h5 class="text-light fw-semibold mb-4">Weather</h5>

    <div v-if="weatherModules.length === 0" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      No IWeather modules online.
    </div>

    <div v-else-if="!currentModule" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      Weather module{{ routeJid ? ` "${routeJid}"` : '' }} is not online.
    </div>

    <div v-else class="d-flex flex-column gap-3">
      <div
        :key="currentModule.jid"
        class="rounded-3 p-3"
        style="background-color:#1a1d21; border:1px solid #2d3035"
      >
        <div class="d-flex align-items-center gap-2 mb-3">
          <span class="status-dot online flex-shrink-0"></span>
          <span class="text-light fw-semibold" style="font-size:0.9rem">{{ currentModule.name }}</span>
          <span class="text-muted" style="font-size:0.75rem">{{ currentModule.jid }}</span>
        </div>

        <div v-if="stateValue === undefined" class="text-muted" style="font-size:0.85rem">
          Waiting for state…
        </div>

        <template v-else>
          <div
            class="rounded-2 px-3 py-2 mb-3 fw-semibold"
            :class="stateValue.good ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger-emphasis'"
            style="font-size:0.85rem; width:fit-content"
          >
            <i :class="stateValue.good ? 'bi bi-check-circle' : 'bi bi-exclamation-triangle'" class="me-1"></i>
            Weather {{ stateValue.good ? 'OK' : 'BAD' }}
          </div>

          <div class="d-flex flex-wrap gap-2 mb-3">
            <div
              v-for="reading in stateValue.readings"
              :key="reading.sensor"
              class="rounded-3 p-2"
              style="background-color:#15181c; border:1px solid #2d3035; min-width:110px"
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
              class="rounded-3 p-2"
              style="background-color:#15181c; border:1px solid #2d3035"
            >
              <TimeSeriesChart
                v-if="(history[reading.sensor]?.length ?? 0) > 1"
                :points="history[reading.sensor]!"
                :label="weatherSensorLabel(reading.sensor)"
                :unit="reading.unit"
              />
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
