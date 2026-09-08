<script setup lang="ts">
// IFilters shared-section widget — see pyobs_gui/filterwidget.py and
// specs/plans/2026-08-04-auxiliary-interface-widgets.md. Rendered in
// ModulePageView.vue's shared section when demoted (sidebarPreferred, a
// module also implementing a primary interface), or as its own tab when
// promoted (a standalone filter-wheel-only module — see moduleWidgets.ts).
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import StatusRow from '@/components/StatusRow.vue'

type FilterState = { filter: string | null }
type MotionState = { status: string }

const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

// Static, read once — filterwidget.py's own get_capabilities call.
const availableFilters = computed(() => (currentModule.value?.capabilities['IFilters']?.filters as string[] | undefined) ?? [])

const filterStateValue = ref<FilterState | undefined>(undefined)
const motionStateValue = ref<MotionState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    filterStateValue.value = undefined
    motionStateValue.value = undefined

    if (!mod) return
    const stops: (() => void)[] = []

    const filterVersion = mod.interfaces['IFilters']?.version
    if (filterVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IFilters', filterVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (filterStateValue.value = v as FilterState | undefined), { immediate: true }))
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

const statusFields = computed(() => {
  const state = filterStateValue.value
  const status = motionStateValue.value?.status
  const fields: { label: string; value: string }[] = []
  if (state) fields.push({ label: 'Filter', value: state.filter ?? 'N/A' })
  if (status) fields.push({ label: 'Status', value: status.charAt(0).toUpperCase() + status.slice(1) })
  return fields
})

// filterwidget.py's own initialized gate: only these motion states allow set_filter.
const INITIALIZED_STATUSES = ['slewing', 'tracking', 'idle', 'positioned']
const initialized = computed(() => {
  const status = motionStateValue.value?.status
  return status !== undefined && INITIALIZED_STATUSES.includes(status)
})

// Local selection, seeded from live state on first arrival (not re-synced on
// every push, matching CoolingView.vue's precedent).
const selectedFilter = ref('')
const seeded = ref(false)

watch(filterStateValue, (state) => {
  if (!state || seeded.value) return
  selectedFilter.value = state.filter ?? ''
  seeded.value = true
})

const error = ref('')

async function apply() {
  const mod = currentModule.value
  if (!mod || !selectedFilter.value) return
  const schema = mod.interfaces['IFilters']?.commands['set_filter'] as CommandSchema | undefined
  if (!schema) return
  error.value = ''
  const res = await executeMethod(mod.fullJid, 'set_filter', [selectedFilter.value], schema)
  if (!res.success) error.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <StatusRow v-if="statusFields.length > 0" :fields="statusFields" />

    <div class="d-flex gap-2 align-items-end">
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Filter</label>
        <select v-model="selectedFilter" class="form-select form-select-sm">
          <option v-for="name in availableFilters" :key="name" :value="name">{{ name }}</option>
        </select>
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!initialized || !selectedFilter || !permitted('set_filter')"
        :title="permitted('set_filter') ? undefined : NOT_PERMITTED_TITLE"
        @click="apply"
      >
        Set
      </button>
    </div>

    <div v-if="error" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
      {{ error }}
    </div>
  </div>
</template>
