<script setup lang="ts">
// Phase 2 of specs/plans/camera-page.md: CameraView.vue + Expose button,
// wired to a live grab_data() call and the phase 1 FitsCanvas widget.
// Single-shot only (no IDataSequence), own-triggered images only (no
// NewImageEvent subscription) — see the plan's Phase 2 section for why.
//
// Phase 3: dedicated IWindow/IBinning/IGain/IImageFormat/IExposureTime/
// IImageType controls — reverses the plan's original call to leave these to
// Shell (see Phase 3's "Scope reversal" note). Deliberately *not* one Set
// button per interface (considered and rejected — six independent buttons is
// worse UX than one combined form): settings are staged in one form and
// applied, one RPC per configured interface, immediately before each
// grab_data() call, matching pyobs-gui's camerawidget.py:271-330. IFilters
// deferred — no live module implements it to verify against yet.
//
// Settings groups show/hide individually by capability, same as pyobs-gui's
// camerawidget.py open() (setVisible per QGroupBox) — no single hide-everything
// toggle (see issue #33). Split display-only into two spots around FitsCanvas:
// exposure time + image type above it (set before every Expose), the rest
// (window, binning, image format, gain) below it (touched far less often).
//
// One tab on ModulePageView.vue now, not its own routed page — see
// specs/plans/module-page-rework.md.
import { ref, computed, watch, onUnmounted, type DeepReadonly } from 'vue'
import { useXmpp, type PyobsModule } from '@/composables/useXmpp'
import { useVfsConfig } from '@/composables/useVfsConfig'
import { allMethodsPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import {
  defaultParamValue,
  enumOptions,
  hasUnsupportedField,
  paramValueFromString,
  unwrapOptional,
  type CommandSchema,
  type FieldSchema,
} from '@/pyobs-codec'
import FitsCanvas from '@/components/FitsCanvas.vue'
import ParamForm from '@/components/ParamForm.vue'

const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()
const { resolveVfsEndpoint } = useVfsConfig()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

// ── Curated status — IExposure's status/progress/exposure_time_left, not the
// raw state dump. See specs/plans/2026-09-07-widget-visual-redesign.md.

type ExposureState = { status: string; progress: number; exposure_time_left: number }

const exposureStateValue = ref<ExposureState | undefined>(undefined)
let stopExposureSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopExposureSubscription?.()
    stopExposureSubscription = undefined
    exposureStateValue.value = undefined

    const version = mod?.interfaces['IExposure']?.version
    if (!mod || version === undefined) return

    const { value, unsubscribe } = subscribeState(mod.jid, 'IExposure', version)
    const stopWatch = watch(value, (v) => (exposureStateValue.value = v as ExposureState | undefined), { immediate: true })
    stopExposureSubscription = () => {
      stopWatch()
      unsubscribe()
    }
  },
  { immediate: true },
)

onUnmounted(() => stopExposureSubscription?.())

const exposureStatusLabel = computed(() => {
  const status = exposureStateValue.value?.status
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : undefined
})

// ── Phase 3: per-interface settings, staged in one form and applied
// immediately before each Expose ──────────────────────────────────────────

const SETTINGS_GROUPS: { key: string; title: string; interfaceName: string; commands: string[] }[] = [
  { key: 'window', title: 'Window', interfaceName: 'IWindow', commands: ['set_window'] },
  { key: 'binning', title: 'Binning', interfaceName: 'IBinning', commands: ['set_binning'] },
  { key: 'imageFormat', title: 'Image format', interfaceName: 'IImageFormat', commands: ['set_image_format'] },
  { key: 'exposureTime', title: 'Exposure time', interfaceName: 'IExposureTime', commands: ['set_exposure_time'] },
  { key: 'gain', title: 'Gain', interfaceName: 'IGain', commands: ['set_gain', 'set_offset'] },
  { key: 'imageType', title: 'Image type', interfaceName: 'IImageType', commands: ['set_image_type'] },
]

type SettingsGroup = {
  key: string
  title: string
  schemas: CommandSchema[]
  fields: FieldSchema[]
  enums: Record<string, string[]>
  capabilities: Record<string, unknown> | undefined
}

const settingsGroups = computed<SettingsGroup[]>(() => {
  const mod = currentModule.value
  if (!mod) return []
  return SETTINGS_GROUPS.flatMap((g) => {
    const iface = mod.interfaces[g.interfaceName]
    if (!iface) return []
    const schemas = g.commands.map((c) => iface.commands[c]).filter((s): s is CommandSchema => !!s)
    if (schemas.length === 0) return []
    return [
      {
        key: g.key,
        title: g.title,
        schemas,
        fields: schemas.flatMap((s) => s.params),
        enums: iface.enums as Record<string, string[]>,
        capabilities: mod.capabilities[g.interfaceName] as Record<string, unknown> | undefined,
      },
    ]
  })
})

// Above-FitsCanvas groups: set before every Expose. Everything else (window,
// binning, image format, gain) renders below — touched far less often.
const TOP_GROUP_KEYS = ['exposureTime', 'imageType']
const topSettingsGroups = computed(() => settingsGroups.value.filter((g) => TOP_GROUP_KEYS.includes(g.key)))
const bottomSettingsGroups = computed(() => settingsGroups.value.filter((g) => !TOP_GROUP_KEYS.includes(g.key)))

const settingsParams = ref<Record<string, string>>({})

// defaultParamValue() leaves required enum fields blank ('—' in the
// <select>) and required numbers at '0' — fine for Shell, where a human
// always reviews params before Execute, but Expose is meant to work with no
// Settings-panel visit at all. Both bit us live: a blank required enum
// (IImageFormat.set_image_format's fmt) gets rejected server-side ("'' is
// not a valid ImageFormat"), and IWindow's width/height defaulting to '0'
// crashed grab_data() with a zero-size-array error deep in DummyCamera's
// image generation. Neither reflects the module's actual current value
// (that would need subscribing to each interface's state, matching
// pyobs-gui's camerawidget.py _init() — not done here, left for a
// follow-up if these guessed defaults prove confusing in practice); a
// guessed-but-valid default beats a value the server can't accept at all.
function seedFieldValue(group: SettingsGroup, field: FieldSchema): string {
  const caps = group.capabilities as Record<string, number> | undefined
  if (group.key === 'window' && caps) {
    const capField = { left: 'full_frame_x', top: 'full_frame_y', width: 'full_frame_width', height: 'full_frame_height' }[field.name]
    if (capField && typeof caps[capField] === 'number') return String(caps[capField])
  }
  if (group.key === 'binning' && (field.name === 'x' || field.name === 'y')) return '1'

  const base = defaultParamValue(field.type)
  if (base !== '' || unwrapOptional(field.type).optional) return base
  return enumOptions(field.type, group.enums)[0] ?? ''
}

watch(
  settingsGroups,
  (groups) => {
    settingsParams.value = Object.fromEntries(groups.flatMap((g) => g.fields.map((f) => [f.name, seedFieldValue(g, f)])))
  },
  { immediate: true },
)

const hasUnsupportedSettingsField = computed(() => settingsGroups.value.some((g) => hasUnsupportedField(g.fields)))

// Expose fires every configured settings-group command plus grab_data as one
// batch (see expose() below) — gated on the whole batch being permitted, not
// grab_data alone, so a partial batch never fires and fails partway through
// on one forbidden call (per acl-aware-shell-forms.md's pyobs-polaris
// precedent).
const exposeBatchMethods = computed(() => [
  ...settingsGroups.value.flatMap((g) => g.schemas.map((s) => s.name)),
  'grab_data',
])
const exposePermitted = computed(() =>
  allMethodsPermitted(currentModule.value?.permittedMethods, exposeBatchMethods.value),
)

const exposing = ref<Record<string, boolean>>({}) // jid -> exposure in flight
const errors = ref<Record<string, string>>({}) // jid -> last error, if any
const images = ref<Record<string, Uint8Array>>({}) // jid -> last grabbed FITS bytes

async function expose(mod: DeepReadonly<PyobsModule>) {
  const schema = mod.interfaces['ICamera']?.commands['grab_data'] as CommandSchema | undefined
  if (!schema) return

  exposing.value = { ...exposing.value, [mod.jid]: true }
  errors.value = { ...errors.value, [mod.jid]: '' }
  try {
    for (const group of settingsGroups.value) {
      for (const cmdSchema of group.schemas) {
        const params = cmdSchema.params.map((p) => paramValueFromString(settingsParams.value[p.name], p.type))
        const setResult = await executeMethod(mod.fullJid, cmdSchema.name, params, cmdSchema)
        if (!setResult.success) {
          errors.value = {
            ...errors.value,
            [mod.jid]: `${group.title}: ${setResult.errorClass ? `${setResult.errorClass}: ` : ''}${String(setResult.value)}`,
          }
          return
        }
      }
    }

    const result = await executeMethod(mod.fullJid, 'grab_data', schema.params.map(() => null), schema)
    if (!result.success) {
      errors.value = {
        ...errors.value,
        [mod.jid]: `${result.errorClass ? `${result.errorClass}: ` : ''}${String(result.value)}`,
      }
      return
    }

    const path = String(result.value)
    const resolved = await resolveVfsEndpoint(path)
    if (!resolved) {
      errors.value = {
        ...errors.value,
        [mod.jid]: `No VFS endpoint configured for "${path}" — add one in Settings.`,
      }
      return
    }

    const headers: HeadersInit = {}
    if (resolved.endpoint.token) {
      headers['Authorization'] = `Bearer ${resolved.endpoint.token}`
    }
    const response = await fetch(resolved.url, { headers })
    if (!response.ok) {
      errors.value = { ...errors.value, [mod.jid]: `Fetching image failed: HTTP ${response.status}` }
      return
    }
    images.value = { ...images.value, [mod.jid]: new Uint8Array(await response.arrayBuffer()) }
  } catch (e) {
    errors.value = { ...errors.value, [mod.jid]: String(e) }
  } finally {
    const next = { ...exposing.value }
    delete next[mod.jid]
    exposing.value = next
  }
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <div v-if="exposureStateValue" class="pyobs-card">
      <div class="d-flex justify-content-between gap-2" style="font-size:0.85rem">
        <span class="text-secondary">Status</span>
        <span class="text-light">{{ exposureStatusLabel }}</span>
      </div>
      <div v-if="exposureStateValue.status === 'exposing' || exposureStateValue.status === 'readout'" class="mt-2">
        <div class="progress" style="height:6px">
          <div
            class="progress-bar"
            role="progressbar"
            :style="{ width: `${exposureStateValue.progress}%` }"
            :aria-valuenow="exposureStateValue.progress"
            aria-valuemin="0"
            aria-valuemax="100"
          ></div>
        </div>
        <div v-if="exposureStateValue.exposure_time_left > 0" class="text-muted mt-1" style="font-size:0.75rem">
          {{ exposureStateValue.exposure_time_left.toFixed(1) }}s left
        </div>
      </div>
    </div>

    <div v-if="topSettingsGroups.length > 0" class="pyobs-card">
      <div v-for="group in topSettingsGroups" :key="group.key" class="mb-2">
        <div class="text-muted fw-semibold mb-1" style="font-size:0.75rem">{{ group.title }}</div>
        <ParamForm v-model="settingsParams" :fields="group.fields" :enums="group.enums" :testid="`camera-settings-${group.key}`" />
      </div>
    </div>

    <div class="d-flex gap-2">
      <button
        type="button"
        class="btn btn-primary btn-sm flex-fill"
        :disabled="!!exposing[currentModule.jid] || hasUnsupportedSettingsField || !exposePermitted"
        :title="exposePermitted ? undefined : NOT_PERMITTED_TITLE"
        @click="expose(currentModule)"
      >
        <span v-if="exposing[currentModule.jid]" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Expose
      </button>
    </div>

    <div v-if="errors[currentModule.jid]" class="alert alert-danger py-1 px-2 mb-0" style="font-size:0.8rem">
      {{ errors[currentModule.jid] }}
    </div>

    <div class="pyobs-card">
      <FitsCanvas :data="images[currentModule.jid] ?? null" />
    </div>

    <div v-if="bottomSettingsGroups.length > 0" class="pyobs-card">
      <div v-for="group in bottomSettingsGroups" :key="group.key" class="mb-2">
        <div class="text-muted fw-semibold mb-1" style="font-size:0.75rem">{{ group.title }}</div>
        <ParamForm v-model="settingsParams" :fields="group.fields" :enums="group.enums" compact :testid="`camera-settings-${group.key}`" />
      </div>
    </div>
  </div>
</template>
