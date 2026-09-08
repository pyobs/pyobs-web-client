<script setup lang="ts">
// ICooling shared-section widget — see pyobs_gui/coolingwidget.py and
// specs/plans/2026-08-04-auxiliary-interface-widgets.md. Rendered in
// ModulePageView.vue's shared section when demoted (sidebarPreferred, a
// module also implementing a primary interface), or as its own tab when
// promoted (a standalone cooling-only module — see moduleWidgets.ts).
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import StatusRow from '@/components/StatusRow.vue'

type CoolingState = { setpoint: number | null; power: number | null; enabled: boolean }

const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

const coolingStateValue = ref<CoolingState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    coolingStateValue.value = undefined

    const version = mod?.interfaces['ICooling']?.version
    if (!mod || version === undefined) return

    const { value, unsubscribe } = subscribeState(mod.jid, 'ICooling', version)
    const stopWatch = watch(value, (v) => (coolingStateValue.value = v as CoolingState | undefined), { immediate: true })
    stopSubscription = () => {
      stopWatch()
      unsubscribe()
    }
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

// Matches coolingwidget.py's update_gui exactly: "OFF" when disabled, else
// setpoint/power (each "N/A" if the driver hasn't reported one yet).
const statusFields = computed(() => {
  const state = coolingStateValue.value
  if (!state) return []
  if (!state.enabled) return [{ label: 'Cooling', value: 'OFF' }]
  return [
    { label: 'Setpoint', value: state.setpoint === null ? 'N/A' : `${state.setpoint.toFixed(1)}°C` },
    { label: 'Power', value: state.power === null ? 'N/A' : `${state.power}%` },
  ]
})

// Local form state, seeded from live state on first arrival (not re-synced
// on every push, matching CameraView.vue's settings-panel precedent — a
// state push shouldn't clobber an in-progress edit).
const enabled = ref(false)
const setpoint = ref(0)
const seeded = ref(false)

watch(coolingStateValue, (state) => {
  if (!state || seeded.value) return
  enabled.value = state.enabled
  setpoint.value = state.setpoint ?? 0
  seeded.value = true
})

const error = ref('')

async function apply() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['ICooling']?.commands['set_cooling'] as CommandSchema | undefined
  if (!schema) return
  error.value = ''
  const res = await executeMethod(mod.fullJid, 'set_cooling', [enabled.value, setpoint.value], schema)
  if (!res.success) error.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <StatusRow v-if="statusFields.length > 0" :fields="statusFields" />

    <div class="d-flex align-items-center gap-2 mt-2">
      <div class="form-check form-switch mb-0">
        <input id="cooling-enabled" v-model="enabled" class="form-check-input" type="checkbox" role="switch" />
        <label class="form-check-label text-muted" style="font-size:0.8rem" for="cooling-enabled">Enabled</label>
      </div>
    </div>

    <div class="d-flex gap-2">
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Setpoint (°C)</label>
        <input v-model.number="setpoint" type="number" step="any" :disabled="!enabled" class="form-control form-control-sm" />
      </div>
    </div>

    <button
      type="button"
      class="btn btn-outline-secondary btn-sm"
      :disabled="!permitted('set_cooling')"
      :title="permitted('set_cooling') ? undefined : NOT_PERMITTED_TITLE"
      @click="apply"
    >
      Apply
    </button>

    <div v-if="error" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
      {{ error }}
    </div>
  </div>
</template>
