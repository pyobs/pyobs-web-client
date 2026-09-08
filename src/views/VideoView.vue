<script setup lang="ts">
// IVideo — Live View tab. See pyobs_gui/videowidget.py and
// specs/plans/2026-09-07-video-widget.md. pyobs-gui hand-parses a raw MJPEG
// socket because Qt has no native decoder; a browser's <img> tag plays an
// MJPEG multipart stream natively, so this widget is just VFS-resolving the
// stream URL and pointing an <img> at it — no socket/parsing code needed.
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import { useVfsConfig } from '@/composables/useVfsConfig'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import type { CommandSchema } from '@/pyobs-codec'

const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()
const { resolveVfsEndpoint } = useVfsConfig()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

// ── Stream URL — resolved once per module, not re-fetched on every render.
// videowidget.py's own open-VFS-path/find-HttpFile logic, minus the
// raw-socket bit an <img> tag makes unnecessary.
const streamUrl = ref<string | undefined>(undefined)
const streamTokenProtected = ref(false)
const streamError = ref('')

watch(
  currentModule,
  async (mod) => {
    streamUrl.value = undefined
    streamTokenProtected.value = false
    streamError.value = ''

    const mjpegPath = (mod?.capabilities['IVideo']?.mjpeg as string | null | undefined) ?? null
    if (!mod || !mjpegPath) return

    const resolved = await resolveVfsEndpoint(mjpegPath)
    if (!resolved) {
      streamError.value = `No VFS endpoint configured for "${mjpegPath}" — add one in Settings.`
      return
    }
    if (resolved.endpoint.token) {
      // An <img> tag's src can't carry a custom Authorization header — see this
      // plan's open question. No token-protected IVideo fixture exists yet to
      // resolve it against, so surface the limitation instead of guessing.
      streamTokenProtected.value = true
      return
    }
    streamUrl.value = resolved.url
  },
  { immediate: true },
)

// ── IExposureTime / IGain — shown only when the module implements them,
// matching groupExposure/groupGain's visibility toggle in videowidget.py.

type ExposureTimeState = { exposure_time: number }
type GainState = { gain: number }

const exposureTimeStateValue = ref<ExposureTimeState | undefined>(undefined)
const gainStateValue = ref<GainState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    exposureTimeStateValue.value = undefined
    gainStateValue.value = undefined

    if (!mod) return
    const stops: (() => void)[] = []

    const expVersion = mod.interfaces['IExposureTime']?.version
    if (expVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IExposureTime', expVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (exposureTimeStateValue.value = v as ExposureTimeState | undefined), { immediate: true }))
    }

    const gainVersion = mod.interfaces['IGain']?.version
    if (gainVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IGain', gainVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (gainStateValue.value = v as GainState | undefined), { immediate: true }))
    }

    stopSubscription = () => stops.forEach((stop) => stop())
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

// Seeded once on first arrival, not re-synced on every push — this app's own
// established precedent (CoolingView.vue etc.) over videowidget.py's literal
// behavior of re-applying the spinbox value (and re-sending it) on every
// state push, which doesn't fit an explicit-Apply mobile form.
const exposureTimeInput = ref(0)
const gainInput = ref(0)
const exposureTimeSeeded = ref(false)
const gainSeeded = ref(false)

watch(exposureTimeStateValue, (state) => {
  if (!state || exposureTimeSeeded.value) return
  exposureTimeInput.value = state.exposure_time
  exposureTimeSeeded.value = true
})
watch(gainStateValue, (state) => {
  if (!state || gainSeeded.value) return
  gainInput.value = state.gain
  gainSeeded.value = true
})

const exposureTimeError = ref('')
const gainError = ref('')

async function setExposureTime() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IExposureTime']?.commands['set_exposure_time'] as CommandSchema | undefined
  if (!schema) return
  exposureTimeError.value = ''
  const res = await executeMethod(mod.fullJid, 'set_exposure_time', [exposureTimeInput.value], schema)
  if (!res.success) exposureTimeError.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
}

async function setGain() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IGain']?.commands['set_gain'] as CommandSchema | undefined
  if (!schema) return
  gainError.value = ''
  const res = await executeMethod(mod.fullJid, 'set_gain', [gainInput.value], schema)
  if (!res.success) gainError.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <div class="pyobs-card p-0" style="overflow:hidden">
      <img v-if="streamUrl" :src="streamUrl" alt="Live view" style="display:block; width:100%; height:auto" />
      <div v-else-if="streamTokenProtected" class="text-muted p-3" style="font-size:0.85rem">
        This stream's VFS endpoint requires a bearer token, which an &lt;img&gt; tag can't send — live
        view isn't supported for this connection yet.
      </div>
      <div v-else-if="streamError" class="text-muted p-3" style="font-size:0.85rem">{{ streamError }}</div>
      <div v-else class="text-muted p-3" style="font-size:0.85rem">No video stream available.</div>
    </div>

    <div v-if="exposureTimeStateValue !== undefined" class="d-flex gap-2 align-items-end">
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Exposure time (s)</label>
        <input v-model.number="exposureTimeInput" type="number" step="any" min="0" class="form-control form-control-sm" />
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!permitted('set_exposure_time')"
        :title="permitted('set_exposure_time') ? undefined : NOT_PERMITTED_TITLE"
        @click="setExposureTime"
      >
        Set
      </button>
    </div>
    <div v-if="exposureTimeError" class="alert alert-danger py-1 px-2 mb-0" style="font-size:0.8rem">{{ exposureTimeError }}</div>

    <div v-if="gainStateValue !== undefined" class="d-flex gap-2 align-items-end">
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Gain</label>
        <input v-model.number="gainInput" type="number" step="any" class="form-control form-control-sm" />
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!permitted('set_gain')"
        :title="permitted('set_gain') ? undefined : NOT_PERMITTED_TITLE"
        @click="setGain"
      >
        Set
      </button>
    </div>
    <div v-if="gainError" class="alert alert-danger py-1 px-2 mb-0" style="font-size:0.8rem">{{ gainError }}</div>
  </div>
</template>
