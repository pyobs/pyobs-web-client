<script setup lang="ts">
import { ref, computed, watch, watchEffect, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import ModuleStateCard from '@/components/ModuleStateCard.vue'
import FocusCurveChart from '@/components/FocusCurveChart.vue'

type RunningState = { running: boolean; time: string }
type AutoFocusPoint = { focus: number; value: number }
type AutoFocusState = { points: AutoFocusPoint[]; time: string }
type AutoFocusResult = { focus: number; focus_err: number }

const route = useRoute()
const router = useRouter()
const { modules, executeMethod, subscribeState } = useXmpp()

const autoFocusModules = computed(() =>
  modules.value.filter((m) => 'IAutoFocus' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)

const routeJid = computed(() => route.params.jid as string | undefined)

const currentModule = computed(() =>
  routeJid.value ? autoFocusModules.value.find((m) => m.jid === routeJid.value) : undefined,
)

// No :jid in the URL: redirect to the first online module (alphabetical), so
// the single-instance case stays a one-click nav hit with no picker step. If
// a module goes offline while its page is open, we stay put and fall through
// to the "not online" empty state below instead of forcing a navigation.
watchEffect(() => {
  if (!routeJid.value && autoFocusModules.value.length > 0) {
    router.replace({ name: 'autofocus', params: { jid: autoFocusModules.value[0]!.jid } })
  }
})

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
  <div style="max-width: 800px">
    <h5 class="text-body fw-semibold mb-4">Auto Focus</h5>

    <div v-if="autoFocusModules.length === 0" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      No IAutoFocus modules online.
    </div>

    <div v-else-if="!currentModule" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      Auto Focus module{{ routeJid ? ` "${routeJid}"` : '' }} is not online.
    </div>

    <div v-else class="d-flex flex-column gap-2">
      <div
        :key="currentModule.jid"
        class="rounded-3 p-3 pyobs-panel"
      >
        <div class="d-flex align-items-center gap-2 mb-2">
          <span class="status-dot online flex-shrink-0"></span>
          <span class="text-body fw-semibold" style="font-size:0.9rem">{{ currentModule.name }}</span>
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

        <div v-if="(autoFocusStateValue?.points.length ?? 0) > 0" class="rounded-3 p-2 mt-2 pyobs-panel-alt">
          <FocusCurveChart
            :points="autoFocusStateValue!.points"
            :result="result ? { focus: result.focus, focusErr: result.focus_err } : undefined"
          />
        </div>
      </div>
    </div>
  </div>
</template>
