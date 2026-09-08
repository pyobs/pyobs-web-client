<script setup lang="ts">
// IVideo — FITS Image tab. See pyobs_gui/videograbwidget.py and
// specs/plans/2026-09-07-video-widget.md. A scoped-down CameraView.vue: image
// type + count + broadcast, grab/abort, FitsCanvas display — no window/
// binning/gain/image-format settings (IVideo doesn't imply those the way
// ICamera modules often have them). videograbwidget.py also references an
// IImageFormat combo box that doesn't exist in its own .ui file — dead code,
// not reproduced here.
import { ref, computed, watch, onUnmounted, type DeepReadonly } from 'vue'
import { useXmpp, type PyobsModule } from '@/composables/useXmpp'
import { useVfsConfig } from '@/composables/useVfsConfig'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import { enumOptions, type CommandSchema } from '@/pyobs-codec'
import FitsCanvas from '@/components/FitsCanvas.vue'

const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()
const { resolveVfsEndpoint } = useVfsConfig()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

// ── IImageType — shown only when the module implements it, matching
// labelImageType/comboImageType's visibility toggle in videograbwidget.py.

type ImageTypeState = { image_type: string }

const imageTypeStateValue = ref<ImageTypeState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    imageTypeStateValue.value = undefined

    const version = mod?.interfaces['IImageType']?.version
    if (!mod || version === undefined) return

    const { value, unsubscribe } = subscribeState(mod.jid, 'IImageType', version)
    const stopWatch = watch(value, (v) => (imageTypeStateValue.value = v as ImageTypeState | undefined), { immediate: true })
    stopSubscription = () => {
      stopWatch()
      unsubscribe()
    }
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

const imageTypeOptions = computed(() => {
  const mod = currentModule.value
  const iface = mod?.interfaces['IImageType']
  const schema = iface?.commands['set_image_type'] as CommandSchema | undefined
  const field = schema?.params[0]
  if (!field) return []
  return enumOptions(field.type, iface!.enums as Record<string, string[]>)
})

const selectedImageType = ref('')
watch(
  imageTypeOptions,
  (options) => {
    if (selectedImageType.value && options.includes(selectedImageType.value)) return
    selectedImageType.value = options.includes('OBJECT') ? 'OBJECT' : (options[0] ?? '')
  },
  { immediate: true },
)
// Track the module's own reported image type when it changes elsewhere (e.g. another client) —
// only while no grab sequence has diverged the selection locally.
watch(imageTypeStateValue, (state) => {
  if (state && imageTypeOptions.value.includes(state.image_type)) selectedImageType.value = state.image_type
})

const count = ref(1)
const broadcast = ref(true)
const exposuresLeft = ref(0)
const grabbing = ref<Record<string, boolean>>({})
const errors = ref<Record<string, string>>({})
const images = ref<Record<string, Uint8Array>>({})

async function grabOne(mod: DeepReadonly<PyobsModule>): Promise<boolean> {
  if (selectedImageType.value) {
    const schema = mod.interfaces['IImageType']?.commands['set_image_type'] as CommandSchema | undefined
    if (schema) {
      const setResult = await executeMethod(mod.fullJid, 'set_image_type', [selectedImageType.value], schema)
      if (!setResult.success) {
        errors.value = { ...errors.value, [mod.jid]: `${setResult.errorClass ? `${setResult.errorClass}: ` : ''}${String(setResult.value)}` }
        return false
      }
    }
  }

  const schema = mod.interfaces['IVideo']?.commands['grab_data'] as CommandSchema | undefined
  if (!schema) return false
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
    errors.value = { ...errors.value, [mod.jid]: `Fetching image failed: HTTP ${response.status}` }
    return false
  }
  images.value = { ...images.value, [mod.jid]: new Uint8Array(await response.arrayBuffer()) }
  return true
}

async function grabSequence(mod: DeepReadonly<PyobsModule>) {
  grabbing.value = { ...grabbing.value, [mod.jid]: true }
  errors.value = { ...errors.value, [mod.jid]: '' }
  exposuresLeft.value = count.value
  try {
    while (exposuresLeft.value > 0) {
      const ok = await grabOne(mod)
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

// videograbwidget.py's own abort_sequence: no RPC call, just stops the loop
// after the in-flight grab finishes.
function abortSequence() {
  exposuresLeft.value = 0
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <div v-if="imageTypeOptions.length > 0" class="flex-fill">
      <label class="text-muted d-block" style="font-size:0.7rem">Image type</label>
      <select v-model="selectedImageType" class="form-select form-select-sm">
        <option v-for="name in imageTypeOptions" :key="name" :value="name">{{ name }}</option>
      </select>
    </div>

    <div class="d-flex gap-2 align-items-end">
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Count</label>
        <input v-model.number="count" type="number" min="1" class="form-control form-control-sm" />
      </div>
      <div class="form-check form-switch mb-1">
        <input id="video-grab-broadcast" v-model="broadcast" class="form-check-input" type="checkbox" role="switch" />
        <label class="form-check-label text-muted" style="font-size:0.8rem" for="video-grab-broadcast">Broadcast</label>
      </div>
    </div>

    <div v-if="exposuresLeft > 0" class="text-muted" style="font-size:0.8rem">{{ exposuresLeft }} exposure(s) left</div>

    <div class="d-flex gap-2 mt-2">
      <button
        type="button"
        class="btn btn-primary btn-sm flex-fill"
        :disabled="!!grabbing[currentModule.jid] || !permitted('grab_data')"
        :title="permitted('grab_data') ? undefined : NOT_PERMITTED_TITLE"
        @click="grabSequence(currentModule)"
      >
        <span v-if="grabbing[currentModule.jid]" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Grab
      </button>
      <button
        type="button"
        class="btn btn-outline-danger btn-sm flex-fill"
        :disabled="exposuresLeft === 0"
        @click="abortSequence"
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
