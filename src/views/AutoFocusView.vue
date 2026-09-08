<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import StatusRow from '@/components/StatusRow.vue'
import FocusCurveChart from '@/components/FocusCurveChart.vue'

type RunningState = { running: boolean; time: string }
type AutoFocusPoint = { focus: number; value: number }
type AutoFocusState = { points: AutoFocusPoint[]; time: string }
type AutoFocusResult = { focus: number; focus_err: number }

// One tab on ModulePageView.vue now — see specs/plans/module-page-rework.md.
const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

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

// Semantic status, matching pyobs-gui's autofocuswidget.py labelStatus exactly (not a generic
// running/idle boolean) — see specs/plans/2026-09-07-widget-visual-redesign.md's corrections.
const statusFields = computed(() => {
  if (runningStateValue.value === undefined) return []
  const value = runningStateValue.value.running
    ? 'Running...'
    : result.value
      ? `Focus: ${result.value.focus.toFixed(3)} ± ${result.value.focus_err.toFixed(3)} mm`
      : 'Idle'
  return [{ label: 'Status', value }]
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
    <StatusRow v-if="statusFields.length > 0" :fields="statusFields" />

    <div class="d-flex gap-2 mt-2">
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Count</label>
        <input v-model.number="count" type="number" class="form-control form-control-sm" />
      </div>
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Step</label>
        <input v-model.number="step" type="number" step="any" class="form-control form-control-sm" />
      </div>
      <div class="flex-fill">
        <label class="text-muted d-block text-truncate" style="font-size:0.7rem">Exposure (s)</label>
        <input v-model.number="exposureTime" type="number" step="any" class="form-control form-control-sm" />
      </div>
    </div>

    <div class="d-flex gap-2 mt-2">
      <button
        type="button"
        class="btn btn-primary btn-sm flex-fill"
        :disabled="running || !permitted('auto_focus')"
        :title="permitted('auto_focus') ? undefined : NOT_PERMITTED_TITLE"
        @click="run"
      >
        <span v-if="running" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Run
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

    <div class="pyobs-card mt-2">
      <FocusCurveChart
        :points="autoFocusStateValue?.points ?? []"
        :result="result ? { focus: result.focus, focusErr: result.focus_err } : undefined"
      />
    </div>
  </div>
</template>
