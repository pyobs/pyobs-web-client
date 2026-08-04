<script setup lang="ts">
import { ref, computed, watch, watchEffect, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import ModuleStateCard from '@/components/ModuleStateCard.vue'
import OffsetMagnitudeChart from '@/components/OffsetMagnitudeChart.vue'
import OffsetScatterChart from '@/components/OffsetScatterChart.vue'

const HISTORY_LENGTH = 50 // matches both reference implementations' own history cap

type RunningState = { running: boolean; time: string }
type ExposureTimeState = { exposure_time: number; time: string }
type OffsetFrame = 'radec' | 'altaz'
type GuidingState = {
  loop_closed: boolean
  offset_frame: OffsetFrame | null
  offset_lon: number | null
  offset_lat: number | null
  time: string
}

const route = useRoute()
const router = useRouter()
const { modules, executeMethod, subscribeState } = useXmpp()

const autoGuidingModules = computed(() =>
  modules.value.filter((m) => 'IAutoGuiding' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)

const routeJid = computed(() => route.params.jid as string | undefined)

const currentModule = computed(() =>
  routeJid.value ? autoGuidingModules.value.find((m) => m.jid === routeJid.value) : undefined,
)

// No :jid in the URL: redirect to the first online module (alphabetical), so
// the single-instance case stays a one-click nav hit with no picker step. If
// a module goes offline while its page is open, we stay put and fall through
// to the "not online" empty state below instead of forcing a navigation.
watchEffect(() => {
  if (!routeJid.value && autoGuidingModules.value.length > 0) {
    router.replace({ name: 'autoguiding', params: { jid: autoGuidingModules.value[0]!.jid } })
  }
})

const runningStateValue = ref<RunningState | undefined>(undefined)
const exposureTimeStateValue = ref<ExposureTimeState | undefined>(undefined)
const guidingStateValue = ref<GuidingState | undefined>(undefined)

// (lon, lat) in arcsec, oldest first, capped at HISTORY_LENGTH.
const offsetHistory = ref<{ lon: number; lat: number }[]>([])

// The exposure-time input only follows live state pushes while it isn't
// mid-edit relative to the last value this page itself synced from the
// server — otherwise a state push would clobber the user's in-progress typing.
const exposureTimeInput = ref<number | undefined>(undefined)
const lastSyncedExposureTime = ref<number | undefined>(undefined)

const error = ref('')

let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    runningStateValue.value = undefined
    exposureTimeStateValue.value = undefined
    guidingStateValue.value = undefined
    offsetHistory.value = []
    exposureTimeInput.value = undefined
    lastSyncedExposureTime.value = undefined
    error.value = ''

    if (!mod) return

    const stops: (() => void)[] = []

    const runningVersion = mod.interfaces['IRunning']?.version
    if (runningVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IRunning', runningVersion)
      stops.push(unsubscribe)
      stops.push(
        watch(
          value,
          (v) => {
            const state = v as RunningState | undefined
            // rising edge -> a new run started (possibly triggered elsewhere), clear the history
            if (state?.running && !runningStateValue.value?.running) {
              offsetHistory.value = []
            }
            runningStateValue.value = state
          },
          { immediate: true },
        ),
      )
    }

    const exposureTimeVersion = mod.interfaces['IExposureTime']?.version
    if (exposureTimeVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IExposureTime', exposureTimeVersion)
      stops.push(unsubscribe)
      stops.push(
        watch(
          value,
          (v) => {
            const state = v as ExposureTimeState | undefined
            exposureTimeStateValue.value = state
            if (!state) return
            const wasSynced = lastSyncedExposureTime.value === undefined || exposureTimeInput.value === lastSyncedExposureTime.value
            lastSyncedExposureTime.value = state.exposure_time
            if (wasSynced) exposureTimeInput.value = state.exposure_time
          },
          { immediate: true },
        ),
      )
    }

    const autoGuidingVersion = mod.interfaces['IAutoGuiding']?.version
    if (autoGuidingVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IAutoGuiding', autoGuidingVersion)
      stops.push(unsubscribe)
      stops.push(
        watch(
          value,
          (v) => {
            const state = v as GuidingState | undefined
            guidingStateValue.value = state
            if (!state || state.offset_lon === null || state.offset_lat === null) return
            const next = [...offsetHistory.value, { lon: state.offset_lon * 3600, lat: state.offset_lat * 3600 }]
            offsetHistory.value = next.slice(-HISTORY_LENGTH)
          },
          { immediate: true },
        ),
      )
    }

    stopSubscription = () => stops.forEach((stop) => stop())
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

const loopStateLabel = computed(() => {
  if (!runningStateValue.value?.running) return 'Stopped'
  return guidingStateValue.value?.loop_closed ? 'Closed loop' : 'Open loop'
})

const magnitudeHistory = computed(() => offsetHistory.value.map((o) => Math.sqrt(o.lon ** 2 + o.lat ** 2)))
const scatterPoints = computed(() => offsetHistory.value.map((o) => ({ x: o.lon, y: o.lat })))

const scatterAxisLabels = computed(() => {
  switch (guidingStateValue.value?.offset_frame) {
    case 'radec':
      return { x: 'RA offset [arcsec]', y: 'Dec offset [arcsec]' }
    case 'altaz':
      return { x: 'Alt offset [arcsec]', y: 'Az offset [arcsec]' }
    default:
      return { x: 'Offset 1 [arcsec]', y: 'Offset 2 [arcsec]' }
  }
})

async function start() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IAutoGuiding']?.commands['start'] as CommandSchema | undefined
  if (!schema) return
  error.value = ''
  const res = await executeMethod(mod.fullJid, 'start', [], schema)
  if (!res.success) error.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
}

async function stop() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IAutoGuiding']?.commands['stop'] as CommandSchema | undefined
  if (!schema) return
  error.value = ''
  const res = await executeMethod(mod.fullJid, 'stop', [], schema)
  if (!res.success) error.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
}

async function setExposureTime() {
  const mod = currentModule.value
  if (!mod || exposureTimeInput.value === undefined) return
  const schema = mod.interfaces['IAutoGuiding']?.commands['set_exposure_time'] as CommandSchema | undefined
  if (!schema) return
  error.value = ''
  const res = await executeMethod(mod.fullJid, 'set_exposure_time', [exposureTimeInput.value], schema)
  if (!res.success) error.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
}
</script>

<template>
  <div style="max-width: 800px">
    <h5 class="text-light fw-semibold mb-4">Auto Guiding</h5>

    <div v-if="autoGuidingModules.length === 0" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      No IAutoGuiding modules online.
    </div>

    <div v-else-if="!currentModule" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      Auto Guiding module{{ routeJid ? ` "${routeJid}"` : '' }} is not online.
    </div>

    <div v-else class="d-flex flex-column gap-2">
      <div
        :key="currentModule.jid"
        class="rounded-3 p-3"
        style="background-color:#1a1d21; border:1px solid #2d3035"
      >
        <div class="d-flex align-items-center gap-2 mb-2">
          <span class="status-dot online flex-shrink-0"></span>
          <span class="text-light fw-semibold" style="font-size:0.9rem">{{ currentModule.name }}</span>
          <span class="text-muted" style="font-size:0.75rem">{{ currentModule.jid }}</span>
        </div>

        <ModuleStateCard
          v-if="currentModule.interfaces['IRunning']"
          :jid="currentModule.jid"
          interface-name="IRunning"
          :version="currentModule.interfaces['IRunning'].version"
          title="Status"
        />

        <div class="d-flex flex-wrap align-items-end gap-2 mt-2">
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="!!runningStateValue?.running"
            @click="start"
          >
            Start
          </button>
          <button
            type="button"
            class="btn btn-outline-danger btn-sm"
            :disabled="!runningStateValue?.running"
            @click="stop"
          >
            Stop
          </button>

          <div>
            <label class="text-muted d-block" style="font-size:0.7rem">Exposure time (s)</label>
            <div class="d-flex gap-1">
              <input
                v-model.number="exposureTimeInput"
                type="number"
                step="any"
                class="form-control form-control-sm"
                style="width:100px"
              />
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="setExposureTime">Set</button>
            </div>
          </div>

          <div class="rounded-2 px-2 py-1 fw-semibold" style="font-size:0.8rem">
            {{ loopStateLabel }}
          </div>
        </div>

        <div v-if="error" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
          {{ error }}
        </div>

        <div v-if="offsetHistory.length > 0" class="d-flex flex-column gap-2 mt-2">
          <div class="rounded-3 p-2" style="background-color:#15181c; border:1px solid #2d3035">
            <OffsetMagnitudeChart :values="magnitudeHistory" />
          </div>
          <div class="rounded-3 p-2" style="background-color:#15181c; border:1px solid #2d3035; max-width:340px">
            <OffsetScatterChart :points="scatterPoints" :x-label="scatterAxisLabels.x" :y-label="scatterAxisLabels.y" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
