<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import StatusRow from '@/components/StatusRow.vue'
import DistanceChart from '@/components/DistanceChart.vue'
import OffsetScatterChart from '@/components/OffsetScatterChart.vue'

type RunningState = { running: boolean; time: string }
type OffsetFrame = 'radec' | 'altaz'
type AcquisitionAttempt = {
  attempt: number
  distance: number
  offset_applied: boolean
  offset_frame: OffsetFrame | null
  offset_lon: number | null
  offset_lat: number | null
}
type AcquisitionResult = {
  time: string
  ra: number
  dec: number
  alt: number
  az: number
  offset_frame: OffsetFrame | null
  offset_lon: number | null
  offset_lat: number | null
}
type AcquisitionState = { attempts: AcquisitionAttempt[]; result: AcquisitionResult | null; time: string }

// One tab on ModulePageView.vue now — see specs/plans/module-page-rework.md.
const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

const running = ref(false) // this page's own run() call in flight
const error = ref('')

const runningStateValue = ref<RunningState | undefined>(undefined)
const acquisitionStateValue = ref<AcquisitionState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    runningStateValue.value = undefined
    acquisitionStateValue.value = undefined
    error.value = ''

    if (!mod) return

    const stops: (() => void)[] = []

    const runningVersion = mod.interfaces['IRunning']?.version
    if (runningVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IRunning', runningVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (runningStateValue.value = v as RunningState | undefined), { immediate: true }))
    }

    const acquisitionVersion = mod.interfaces['IAcquisition']?.version
    if (acquisitionVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IAcquisition', acquisitionVersion)
      stops.push(unsubscribe)
      stops.push(
        watch(value, (v) => (acquisitionStateValue.value = v as AcquisitionState | undefined), { immediate: true }),
      )
    }

    stopSubscription = () => stops.forEach((stop) => stop())
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

// Semantic status, matching pyobs-gui's acquisitionwidget.py labelStatus exactly (not a generic
// running/idle boolean) — see specs/plans/2026-09-07-widget-visual-redesign.md's corrections.
const statusFields = computed(() => {
  if (runningStateValue.value === undefined) return []
  const value = runningStateValue.value.running
    ? 'Acquiring...'
    : acquisitionStateValue.value?.result
      ? 'Acquired.'
      : 'Idle'
  return [{ label: 'Status', value }]
})

const distancePoints = computed(
  () => acquisitionStateValue.value?.attempts.map((a) => ({ attempt: a.attempt, distance: a.distance })) ?? [],
)

// Only attempts where an offset frame is actually known — offset_lon/lat are
// null before the first correction, and null gaps shouldn't render as 0.
const scatterPoints = computed(() =>
  (acquisitionStateValue.value?.attempts ?? [])
    .filter((a) => a.offset_frame !== null && a.offset_lon !== null && a.offset_lat !== null)
    .map((a) => ({ x: a.offset_lon! * 3600, y: a.offset_lat! * 3600 })),
)

const lastKnownOffsetFrame = computed<OffsetFrame | null>(() => {
  const attempts = acquisitionStateValue.value?.attempts ?? []
  for (let i = attempts.length - 1; i >= 0; i--) {
    const frame = attempts[i]!.offset_frame
    if (frame !== null) return frame
  }
  return null
})

const scatterAxisLabels = computed(() => {
  switch (lastKnownOffsetFrame.value) {
    case 'radec':
      return { x: 'RA offset [arcsec]', y: 'Dec offset [arcsec]' }
    case 'altaz':
      return { x: 'Alt offset [arcsec]', y: 'Az offset [arcsec]' }
    default:
      return { x: 'Offset 1 [arcsec]', y: 'Offset 2 [arcsec]' }
  }
})

const resultOffsetLabel = computed(() => {
  const result = acquisitionStateValue.value?.result
  if (!result || result.offset_frame === null || result.offset_lon === null || result.offset_lat === null) {
    return undefined
  }
  const label = result.offset_frame === 'radec' ? 'RA/Dec offset' : 'Alt/Az offset'
  return `${label}: ${(result.offset_lon * 3600).toFixed(2)}" / ${(result.offset_lat * 3600).toFixed(2)}"`
})

async function run() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IAcquisition']?.commands['acquire_target'] as CommandSchema | undefined
  if (!schema) return

  running.value = true
  error.value = ''
  try {
    const res = await executeMethod(mod.fullJid, 'acquire_target', [], schema)
    if (!res.success) {
      error.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
    }
  } catch (e) {
    error.value = String(e)
  } finally {
    running.value = false
  }
}

async function abort() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IAbortable']?.commands['abort'] as CommandSchema | undefined
  if (!schema) return

  try {
    const res = await executeMethod(mod.fullJid, 'abort', [], schema)
    if (!res.success) {
      error.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
    }
  } catch (e) {
    error.value = String(e)
  }
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <StatusRow v-if="statusFields.length > 0" :fields="statusFields" />

    <div class="d-flex gap-2 mt-2">
      <button
        type="button"
        class="btn btn-primary btn-sm flex-fill"
        :disabled="running || !permitted('acquire_target')"
        :title="permitted('acquire_target') ? undefined : NOT_PERMITTED_TITLE"
        @click="run"
      >
        <span v-if="running" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Acquire
      </button>
      <button
        type="button"
        class="btn btn-outline-danger btn-sm flex-fill"
        :disabled="!runningStateValue?.running || !permitted('abort')"
        :title="permitted('abort') ? undefined : NOT_PERMITTED_TITLE"
        @click="abort"
      >
        Abort
      </button>
    </div>

    <div v-if="error" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
      {{ error }}
    </div>

    <div
      v-if="acquisitionStateValue?.result"
      class="alert alert-success py-1 px-2 mt-2 mb-0"
      style="font-size:0.8rem"
    >
      <div>
        RA/Dec: {{ acquisitionStateValue.result.ra.toFixed(5) }}° / {{ acquisitionStateValue.result.dec.toFixed(5) }}°
        &nbsp;·&nbsp;
        Alt/Az: {{ acquisitionStateValue.result.alt.toFixed(3) }}° / {{ acquisitionStateValue.result.az.toFixed(3) }}°
      </div>
      <div v-if="resultOffsetLabel">{{ resultOffsetLabel }}</div>
    </div>

    <div class="d-flex flex-column gap-2 mt-2">
      <div class="pyobs-card">
        <DistanceChart :points="distancePoints" />
      </div>
      <div class="pyobs-card">
        <OffsetScatterChart :points="scatterPoints" :x-label="scatterAxisLabels.x" :y-label="scatterAxisLabels.y" />
      </div>
    </div>
  </div>
</template>
