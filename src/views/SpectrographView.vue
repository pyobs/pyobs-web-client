<script setup lang="ts">
// ISpectrograph — see pyobs_gui/spectrographwidget.py and
// specs/plans/2026-09-07-spectrograph-widget.md. CameraView.vue's Phase 2
// shape (expose/abort/status/progress) with no Phase 3 settings panel — a
// spectrograph has no window/binning/gain/image-format controls to speak of.
import { ref, computed, watch, onUnmounted, type DeepReadonly } from 'vue'
import { useXmpp, type PyobsModule } from '@/composables/useXmpp'
import { useVfsConfig } from '@/composables/useVfsConfig'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import type { CommandSchema } from '@/pyobs-codec'
import StatusRow from '@/components/StatusRow.vue'
import FitsCanvas from '@/components/FitsCanvas.vue'

const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()
const { resolveVfsEndpoint } = useVfsConfig()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

type ExposureState = { status: string; progress: number; exposure_time_left: number }

const exposureStateValue = ref<ExposureState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    exposureStateValue.value = undefined

    const version = mod?.interfaces['IExposure']?.version
    if (!mod || version === undefined) return

    const { value, unsubscribe } = subscribeState(mod.jid, 'IExposure', version)
    const stopWatch = watch(value, (v) => (exposureStateValue.value = v as ExposureState | undefined), { immediate: true })
    stopSubscription = () => {
      stopWatch()
      unsubscribe()
    }
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

const exposureStatusLabel = computed(() => {
  const status = exposureStateValue.value?.status
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : undefined
})

const count = ref(1)
const broadcast = ref(true)

const exposuresLeft = ref(0) // > 0 while a multi-shot sequence is running — spectrographwidget.py's own field
const grabbing = ref<Record<string, boolean>>({}) // jid -> sequence in flight
const errors = ref<Record<string, string>>({})
const images = ref<Record<string, Uint8Array>>({}) // jid -> last grabbed spectrum's FITS bytes

async function grabOne(mod: DeepReadonly<PyobsModule>, schema: CommandSchema): Promise<boolean> {
  const result = await executeMethod(mod.fullJid, 'grab_data', [broadcast.value], schema)
  if (!result.success) {
    errors.value = { ...errors.value, [mod.jid]: `${result.errorClass ? `${result.errorClass}: ` : ''}${String(result.value)}` }
    return false
  }

  const path = String(result.value)
  const resolved = await resolveVfsEndpoint(path)
  if (!resolved) {
    errors.value = { ...errors.value, [mod.jid]: `No VFS endpoint configured for "${path}" — add one in Settings.` }
    return false
  }

  const headers: HeadersInit = {}
  if (resolved.endpoint.token) headers['Authorization'] = `Bearer ${resolved.endpoint.token}`
  const response = await fetch(resolved.url, { headers })
  if (!response.ok) {
    errors.value = { ...errors.value, [mod.jid]: `Fetching spectrum failed: HTTP ${response.status}` }
    return false
  }
  images.value = { ...images.value, [mod.jid]: new Uint8Array(await response.arrayBuffer()) }
  return true
}

async function grabSequence(mod: DeepReadonly<PyobsModule>) {
  const schema = mod.interfaces['ISpectrograph']?.commands['grab_data'] as CommandSchema | undefined
  if (!schema) return

  grabbing.value = { ...grabbing.value, [mod.jid]: true }
  errors.value = { ...errors.value, [mod.jid]: '' }
  exposuresLeft.value = count.value
  try {
    while (exposuresLeft.value > 0) {
      const ok = await grabOne(mod, schema)
      if (!ok) break
      exposuresLeft.value -= 1
    }
  } catch (e) {
    errors.value = { ...errors.value, [mod.jid]: String(e) }
  } finally {
    exposuresLeft.value = 0
    const next = { ...grabbing.value }
    delete next[mod.jid]
    grabbing.value = next
  }
}

async function abort(mod: DeepReadonly<PyobsModule>) {
  const schema = mod.interfaces['IAbortable']?.commands['abort'] as CommandSchema | undefined
  if (!schema) return
  exposuresLeft.value = 0 // stop the sequence loop after the in-flight grab finishes, matching spectrographwidget.py
  const result = await executeMethod(mod.fullJid, 'abort', [], schema)
  if (!result.success) {
    errors.value = { ...errors.value, [mod.jid]: `${result.errorClass ? `${result.errorClass}: ` : ''}${String(result.value)}` }
  }
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <StatusRow v-if="exposureStatusLabel" :fields="[{ label: 'Status', value: exposureStatusLabel }]" />
    <div v-if="exposureStateValue && exposureStateValue.status !== 'idle'" class="pyobs-card">
      <div class="progress" style="height:6px">
        <div
          class="progress-bar"
          role="progressbar"
          :style="{ width: `${exposureStateValue.status === 'readout' ? 100 : exposureStateValue.progress}%` }"
          :aria-valuenow="exposureStateValue.progress"
          aria-valuemin="0"
          aria-valuemax="100"
        ></div>
      </div>
      <div v-if="exposureStateValue.exposure_time_left > 0" class="text-muted mt-1" style="font-size:0.75rem">
        {{ exposureStateValue.exposure_time_left.toFixed(1) }}s left
      </div>
    </div>

    <div class="d-flex gap-2 align-items-end mt-2">
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Count</label>
        <input v-model.number="count" type="number" min="1" class="form-control form-control-sm" />
      </div>
      <div class="form-check form-switch mb-1">
        <input id="spectrograph-broadcast" v-model="broadcast" class="form-check-input" type="checkbox" role="switch" />
        <label class="form-check-label text-muted" style="font-size:0.8rem" for="spectrograph-broadcast">Broadcast</label>
      </div>
    </div>

    <div v-if="exposuresLeft > 0" class="text-muted" style="font-size:0.8rem">
      {{ exposuresLeft }} spectrum/spectra left
    </div>

    <div class="d-flex gap-2 mt-2">
      <button
        type="button"
        class="btn btn-primary btn-sm flex-fill"
        :disabled="!!grabbing[currentModule.jid] || exposureStateValue?.status !== 'idle' || !permitted('grab_data')"
        :title="permitted('grab_data') ? undefined : NOT_PERMITTED_TITLE"
        @click="grabSequence(currentModule)"
      >
        <span v-if="grabbing[currentModule.jid]" class="spinner-border spinner-border-sm me-1" role="status"></span>
        {{ exposuresLeft > 1 ? 'Grab sequence' : 'Grab' }}
      </button>
      <button
        v-if="currentModule.interfaces['IAbortable']"
        type="button"
        class="btn btn-outline-danger btn-sm flex-fill"
        :disabled="!grabbing[currentModule.jid] || !permitted('abort')"
        :title="permitted('abort') ? undefined : NOT_PERMITTED_TITLE"
        @click="abort(currentModule)"
      >
        Abort
      </button>
    </div>

    <div v-if="errors[currentModule.jid]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
      {{ errors[currentModule.jid] }}
    </div>

    <div class="pyobs-card mt-2">
      <FitsCanvas :data="images[currentModule.jid] ?? null" />
    </div>
  </div>
</template>
