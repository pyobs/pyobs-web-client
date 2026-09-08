<script setup lang="ts">
// IFocuser shared-section widget — see pyobs_gui/focuswidget.py and
// specs/plans/2026-08-04-auxiliary-interface-widgets.md. Rendered in
// ModulePageView.vue's shared section when demoted (sidebarPreferred, a
// module also implementing a primary interface), or as its own tab when
// promoted (a standalone focuser-only module — see moduleWidgets.ts).
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import StatusRow from '@/components/StatusRow.vue'

type FocuserState = { focus: number | null; focus_offset: number | null }
type MotionState = { status: string }

const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

const focuserStateValue = ref<FocuserState | undefined>(undefined)
const motionStateValue = ref<MotionState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    focuserStateValue.value = undefined
    motionStateValue.value = undefined

    if (!mod) return
    const stops: (() => void)[] = []

    const focuserVersion = mod.interfaces['IFocuser']?.version
    if (focuserVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IFocuser', focuserVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (focuserStateValue.value = v as FocuserState | undefined), { immediate: true }))
    }

    const motionVersion = mod.interfaces['IMotion']?.version
    if (motionVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IMotion', motionVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (motionStateValue.value = v as MotionState | undefined), { immediate: true }))
    }

    stopSubscription = () => stops.forEach((stop) => stop())
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

// Matches focuswidget.py's update_gui exactly: combined focus (base +
// offset, "" if either hasn't reported), base, offset, motion status.
const statusFields = computed(() => {
  const state = focuserStateValue.value
  if (!state) return []
  const combined = state.focus === null || state.focus_offset === null ? 'N/A' : (state.focus + state.focus_offset).toFixed(3)
  return [
    { label: 'Focus', value: combined },
    { label: 'Base', value: state.focus === null ? 'N/A' : state.focus.toFixed(3) },
    { label: 'Offset', value: state.focus_offset === null ? 'N/A' : state.focus_offset.toFixed(3) },
  ]
})

const motionStatusFields = computed(() => {
  const status = motionStateValue.value?.status
  if (!status) return []
  return [{ label: 'Status', value: status.charAt(0).toUpperCase() + status.slice(1) }]
})

// focuswidget.py's own initialized gate: only these motion states allow
// set_focus/set_focus_offset (mid-slew or parked/error/etc. are excluded).
const INITIALIZED_STATUSES = ['slewing', 'tracking', 'idle', 'positioned']
const initialized = computed(() => {
  const status = motionStateValue.value?.status
  return status !== undefined && INITIALIZED_STATUSES.includes(status)
})

// Local form state, seeded from live state on first arrival (not re-synced
// on every push, matching CoolingView.vue's precedent — a state push
// shouldn't clobber an in-progress edit).
const baseInput = ref(0)
const offsetInput = ref(0)
const seeded = ref(false)

watch(focuserStateValue, (state) => {
  if (!state || seeded.value) return
  baseInput.value = state.focus ?? 0
  offsetInput.value = state.focus_offset ?? 0
  seeded.value = true
})

const baseError = ref('')
const offsetError = ref('')

async function setBase() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IFocuser']?.commands['set_focus'] as CommandSchema | undefined
  if (!schema) return
  baseError.value = ''
  const res = await executeMethod(mod.fullJid, 'set_focus', [baseInput.value], schema)
  if (!res.success) baseError.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
}

async function setOffset(value: number) {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IFocuser']?.commands['set_focus_offset'] as CommandSchema | undefined
  if (!schema) return
  offsetError.value = ''
  const res = await executeMethod(mod.fullJid, 'set_focus_offset', [value], schema)
  if (!res.success) offsetError.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <StatusRow v-if="statusFields.length > 0" :fields="statusFields" />
    <StatusRow v-if="motionStatusFields.length > 0" :fields="motionStatusFields" />

    <div class="d-flex gap-2 align-items-end">
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Focus (mm)</label>
        <input v-model.number="baseInput" type="number" step="any" class="form-control form-control-sm" />
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!initialized || !permitted('set_focus')"
        :title="permitted('set_focus') ? undefined : NOT_PERMITTED_TITLE"
        @click="setBase"
      >
        Set
      </button>
    </div>
    <div v-if="baseError" class="alert alert-danger py-1 px-2 mb-0" style="font-size:0.8rem">{{ baseError }}</div>

    <div class="d-flex gap-2 align-items-end">
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Offset (mm)</label>
        <input v-model.number="offsetInput" type="number" step="any" class="form-control form-control-sm" />
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!initialized || !permitted('set_focus_offset')"
        :title="permitted('set_focus_offset') ? undefined : NOT_PERMITTED_TITLE"
        @click="setOffset(offsetInput)"
      >
        Set
      </button>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!initialized || !permitted('set_focus_offset')"
        :title="permitted('set_focus_offset') ? undefined : NOT_PERMITTED_TITLE"
        @click="setOffset(0)"
      >
        Reset
      </button>
    </div>
    <div v-if="offsetError" class="alert alert-danger py-1 px-2 mb-0" style="font-size:0.8rem">{{ offsetError }}</div>
  </div>
</template>
