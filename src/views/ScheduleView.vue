<script setup lang="ts">
// IRoboticScheduler — see pyobs_gui/schedulewidget.py and
// specs/plans/2026-09-07-robotic-widgets.md. get_schedule() can be a live
// remote HTTP call (e.g. an LCO portal) — polled on the same 30s interval as
// the reference, not faster. The task table is condensed to a card-per-task
// list (DashboardView.vue's compact module-card shape), the mobile-appropriate
// replacement for tableSchedule's literal column layout.
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import { useConfirmArm } from '@/composables/useConfirmArm'
import type { CommandSchema } from '@/pyobs-codec'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'

const SCHEDULE_POLL_INTERVAL_MS = 30_000 // matches schedulewidget.py's _SCHEDULE_POLL_INTERVAL
const SCHEDULE_LIMIT = 20 // matches schedulewidget.py's _SCHEDULE_LIMIT

type RoboticTask = {
  name: string
  target: string | null
  start: string | null
  end: string | null
  state: string | null
  priority: number | null
}
type RunningState = { running: boolean }
type SchedulerState = { last_reschedule: string | null }

const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

// Tap-to-arm confirmation — see #38.
const confirmArm = useConfirmArm()

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

const runningStateValue = ref<RunningState | undefined>(undefined)
const schedulerStateValue = ref<SchedulerState | undefined>(undefined)
const schedule = ref<RoboticTask[]>([])
const scheduleError = ref('')
let stopSubscription: (() => void) | undefined
let pollHandle: ReturnType<typeof setInterval> | undefined

async function refreshSchedule() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IRoboticScheduler']?.commands['get_schedule'] as CommandSchema | undefined
  if (!schema) return
  const result = await executeMethod(mod.fullJid, 'get_schedule', [SCHEDULE_LIMIT], schema)
  if (result.success) {
    schedule.value = result.value as RoboticTask[]
    scheduleError.value = ''
  } else {
    scheduleError.value = `${result.errorClass ? `${result.errorClass}: ` : ''}${String(result.value)}`
  }
}

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    clearInterval(pollHandle)
    runningStateValue.value = undefined
    schedulerStateValue.value = undefined
    schedule.value = []
    scheduleError.value = ''

    if (!mod) return
    const stops: (() => void)[] = []

    const runningVersion = mod.interfaces['IRunning']?.version
    if (runningVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IRunning', runningVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (runningStateValue.value = v as RunningState | undefined), { immediate: true }))
    }

    const schedulerVersion = mod.interfaces['IRoboticScheduler']?.version
    if (schedulerVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IRoboticScheduler', schedulerVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (schedulerStateValue.value = v as SchedulerState | undefined), { immediate: true }))
    }

    stopSubscription = () => stops.forEach((stop) => stop())

    refreshSchedule()
    pollHandle = setInterval(refreshSchedule, SCHEDULE_POLL_INTERVAL_MS)
  },
  { immediate: true },
)

onUnmounted(() => {
  stopSubscription?.()
  clearInterval(pollHandle)
})

function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

const statusLine = computed(() => {
  const running = runningStateValue.value?.running ? 'Running' : 'Stopped'
  const last = schedulerStateValue.value?.last_reschedule
  return `${running} — last re-schedule: ${last ? formatTime(last) : 'never'}`
})

async function start() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IRoboticScheduler']?.commands['start'] as CommandSchema | undefined
  if (!schema) return
  await executeMethod(mod.fullJid, 'start', [], schema)
}

async function stop() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IRoboticScheduler']?.commands['stop'] as CommandSchema | undefined
  if (!schema) return
  await executeMethod(mod.fullJid, 'stop', [], schema)
}

const rescheduling = ref(false)

async function reschedule() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IRunnable']?.commands['run'] as CommandSchema | undefined
  if (!schema) return
  rescheduling.value = true
  try {
    await executeMethod(mod.fullJid, 'run', [], schema)
    await refreshSchedule()
  } finally {
    rescheduling.value = false
  }
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <div class="text-muted" style="font-size:0.8rem">{{ statusLine }}</div>

    <div class="d-flex gap-2 mt-1">
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
      <button
        v-if="currentModule.interfaces['IRunnable']"
        type="button"
        class="btn btn-sm flex-fill"
        :class="confirmArm.isArmed('reschedule') ? 'btn-warning' : 'btn-outline-secondary'"
        :disabled="rescheduling || !permitted('run')"
        :title="permitted('run') ? undefined : NOT_PERMITTED_TITLE"
        @click="confirmArm.confirm('reschedule') && reschedule()"
      >
        <span v-if="rescheduling" class="spinner-border spinner-border-sm me-1" role="status"></span>
        {{ confirmArm.isArmed('reschedule') ? 'Confirm reschedule?' : 'Reschedule' }}
      </button>
    </div>

    <div v-if="scheduleError" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
      {{ scheduleError }}
    </div>

    <div class="d-flex flex-column gap-2 mt-2">
      <div v-if="schedule.length === 0" class="text-muted" style="font-size:0.85rem">No scheduled tasks.</div>
      <div v-for="(task, i) in schedule" :key="i" class="pyobs-card">
        <div class="d-flex justify-content-between gap-2">
          <div class="text-light fw-semibold text-truncate" style="font-size:0.9rem">{{ task.target ?? task.name }}</div>
          <div v-if="task.state" class="text-muted text-truncate" style="font-size:0.75rem">{{ task.state }}</div>
        </div>
        <div class="text-muted text-truncate" style="font-size:0.75rem">
          {{ formatTime(task.start) }} – {{ formatTime(task.end) }}
        </div>
      </div>
    </div>
  </div>
</template>
