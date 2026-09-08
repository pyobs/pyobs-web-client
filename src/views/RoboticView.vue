<script setup lang="ts">
// IRobotic — see pyobs_gui/roboticwidget.py and
// specs/plans/2026-09-07-robotic-widgets.md. Extends IStartStop/IRunning,
// same Start/Stop shape AutoGuidingView.vue already has. The one new
// interaction this app doesn't have a precedent for: a countdown to the next
// task's start that ticks every second on its own, not just on state pushes
// (roboticwidget.py's own update_func=self._tick).
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import StatusRow from '@/components/StatusRow.vue'

type RoboticTask = {
  name: string
  target: string | null
  start: string | null
  end: string | null
  obsnum: string | null
  state: string | null
  priority: number | null
}
type RoboticState = { current: RoboticTask | null; next: RoboticTask | null; cant_run_reason: string | null }
type RunningState = { running: boolean }

const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

const runningStateValue = ref<RunningState | undefined>(undefined)
const roboticStateValue = ref<RoboticState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    runningStateValue.value = undefined
    roboticStateValue.value = undefined

    if (!mod) return
    const stops: (() => void)[] = []

    const runningVersion = mod.interfaces['IRunning']?.version
    if (runningVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IRunning', runningVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (runningStateValue.value = v as RunningState | undefined), { immediate: true }))
    }

    const roboticVersion = mod.interfaces['IRobotic']?.version
    if (roboticVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IRobotic', roboticVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (roboticStateValue.value = v as RoboticState | undefined), { immediate: true }))
    }

    stopSubscription = () => stops.forEach((stop) => stop())
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

// Drives the countdown below independent of state pushes — roboticwidget.py's own 1s
// update_func tick.
const now = ref(Date.now())
const tickHandle = setInterval(() => (now.value = Date.now()), 1000)
onUnmounted(() => clearInterval(tickHandle))

function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : ''
}

function formatCountdown(iso: string | null): string {
  if (!iso) return ''
  const seconds = (new Date(iso).getTime() - now.value) / 1000
  if (seconds <= 0) return 'overdue'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const statusFields = computed(() => {
  if (runningStateValue.value === undefined) return []
  return [{ label: 'Status', value: runningStateValue.value.running ? 'Running' : 'Stopped' }]
})

const currentFields = computed(() => {
  const task = roboticStateValue.value?.current
  if (!task) return []
  return [
    { label: 'Target', value: task.target ?? task.name },
    { label: 'Started', value: formatTime(task.start) },
    { label: 'ETA', value: formatCountdown(task.end) },
  ]
})

const nextFields = computed(() => {
  const task = roboticStateValue.value?.next
  if (!task) return []
  return [
    { label: 'Target', value: task.target ?? task.name },
    { label: 'Starts', value: formatTime(task.start) },
    { label: 'Countdown', value: formatCountdown(task.start) },
  ]
})

async function start() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IRobotic']?.commands['start'] as CommandSchema | undefined
  if (!schema) return
  await executeMethod(mod.fullJid, 'start', [], schema)
}

async function stop() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IRobotic']?.commands['stop'] as CommandSchema | undefined
  if (!schema) return
  await executeMethod(mod.fullJid, 'stop', [], schema)
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <StatusRow v-if="statusFields.length > 0" :fields="statusFields" />

    <div class="d-flex gap-2 mt-2">
      <button
        type="button"
        class="btn btn-primary btn-sm flex-fill"
        :disabled="!!runningStateValue?.running || !permitted('start')"
        :title="permitted('start') ? undefined : NOT_PERMITTED_TITLE"
        @click="start"
      >
        Start
      </button>
      <button
        type="button"
        class="btn btn-outline-danger btn-sm flex-fill"
        :disabled="!runningStateValue?.running || !permitted('stop')"
        :title="permitted('stop') ? undefined : NOT_PERMITTED_TITLE"
        @click="stop"
      >
        Stop
      </button>
    </div>

    <StatusRow v-if="currentFields.length > 0" title="Current task" :fields="currentFields" class="mt-2" />
    <div v-else class="text-muted mt-2" style="font-size:0.85rem">No task currently running.</div>

    <StatusRow v-if="nextFields.length > 0" title="Next task" :fields="nextFields" class="mt-2" />
    <div
      v-if="roboticStateValue?.cant_run_reason"
      class="alert alert-warning py-1 px-2 mt-2 mb-0"
      style="font-size:0.8rem"
    >
      {{ roboticStateValue.cant_run_reason }}
    </div>
  </div>
</template>
