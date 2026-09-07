<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import ModuleStateCard from '@/components/ModuleStateCard.vue'
import FocusCurveChart from '@/components/FocusCurveChart.vue'

type RunningState = { running: boolean; time: string }
type AutoFocusPoint = { focus: number; value: number }
type AutoFocusState = { points: AutoFocusPoint[]; time: string }
type AutoFocusResult = { focus: number; focus_err: number }

// One tab on ModulePageView.vue now — see specs/plans/module-page-rework.md.
const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

const count = ref(3)
const step = ref(1)
const exposureTime = ref(1)

const running = ref(false) // this page's own run() call in flight
const error = ref('')
const result = ref<AutoFocusResult | undefined>(undefined)

const runningStateValue = ref<RunningState | undefined>(undefined)
const autoFocusStateValue = ref<AutoFocusState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    runningStateValue.value = undefined
    autoFocusStateValue.value = undefined
    error.value = ''
    result.value = undefined

    if (!mod) return

    const stops: (() => void)[] = []

    const runningVersion = mod.interfaces['IRunning']?.version
    if (runningVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IRunning', runningVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (runningStateValue.value = v as RunningState | undefined), { immediate: true }))
    }

    const autoFocusVersion = mod.interfaces['IAutoFocus']?.version
    if (autoFocusVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IAutoFocus', autoFocusVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (autoFocusStateValue.value = v as AutoFocusState | undefined), { immediate: true }))
    }

    stopSubscription = () => stops.forEach((stop) => stop())
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

const exposureTimeUnit = computed(() => {
  const schema = currentModule.value?.interfaces['IAutoFocus']?.commands['auto_focus'] as CommandSchema | undefined
  return schema?.params.find((p) => p.name === 'exposure_time')?.unit
})

async function run() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IAutoFocus']?.commands['auto_focus'] as CommandSchema | undefined
  if (!schema) return

  running.value = true
  error.value = ''
  result.value = undefined
  try {
    const res = await executeMethod(mod.fullJid, 'auto_focus', [count.value, step.value, exposureTime.value], schema)
    if (res.success) {
      result.value = res.value as AutoFocusResult
    } else {
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
    <ModuleStateCard
      v-if="currentModule.interfaces['IRunning']"
      :jid="currentModule.jid"
      interface-name="IRunning"
      :version="currentModule.interfaces['IRunning'].version"
      title="Status"
    />

    <div class="d-flex flex-wrap align-items-end gap-2 mt-2">
      <div>
        <label class="text-muted d-block" style="font-size:0.7rem">Count</label>
        <input v-model.number="count" type="number" class="form-control form-control-sm" style="width:90px" />
      </div>
      <div>
        <label class="text-muted d-block" style="font-size:0.7rem">Step</label>
        <input v-model.number="step" type="number" step="any" class="form-control form-control-sm" style="width:90px" />
      </div>
      <div>
        <label class="text-muted d-block" style="font-size:0.7rem">
          Exposure time{{ exposureTimeUnit ? ` (${exposureTimeUnit})` : '' }}
        </label>
        <input v-model.number="exposureTime" type="number" step="any" class="form-control form-control-sm" style="width:110px" />
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="running"
        @click="run"
      >
        <span v-if="running" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Run
      </button>
      <button
        type="button"
        class="btn btn-outline-danger btn-sm"
        :disabled="!runningStateValue?.running"
        @click="abort"
      >
        Abort
      </button>
    </div>

    <div v-if="error" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
      {{ error }}
    </div>

    <div v-if="result" class="alert alert-success py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
      Focus: {{ result.focus.toFixed(3) }} ± {{ result.focus_err.toFixed(3) }}
    </div>

    <div v-if="(autoFocusStateValue?.points.length ?? 0) > 0" class="rounded-3 p-2 mt-2" style="background-color:#15181c; border:1px solid #2d3035">
      <FocusCurveChart
        :points="autoFocusStateValue!.points"
        :result="result ? { focus: result.focus, focusErr: result.focus_err } : undefined"
      />
    </div>
  </div>
</template>
