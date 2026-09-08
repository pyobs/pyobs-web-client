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
  hasUnsupportedField,
  paramValueFromString,
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

// IBinning.capabilities = BinningCapabilities(binnings: list[Binning]) — when
// a module publishes it, the binning group renders a single dropdown of
// valid x/y pairs instead of the generic two-number-input fallback (issue #41).
type Binning = { x: number; y: number }
function binningOptions(capabilities: Record<string, unknown> | undefined): Binning[] | undefined {
  const binnings = capabilities?.binnings as Binning[] | undefined
  return binnings && binnings.length > 0 ? binnings : undefined
}

const binningSelection = computed({
  get: () => `${settingsParams.value['x']}x${settingsParams.value['y']}`,
  set: (val: string) => {
    const [x, y] = val.split('x')
    settingsParams.value = { ...settingsParams.value, x: x ?? '1', y: y ?? '1' }
    resetWindowToFullFrame()
  },
})

// IWindow.capabilities = WindowCapabilities(full_frame_x/y/width/height) —
// the only bound pyobs-core publishes is the unbinned full-frame size, so
// the binned max is derived here the same way pyobs-gui's camerawidget.py
// _do_set_full_frame() does: full_frame_size / binning (verified against
// that reference implementation for issue #43 — pyobs-core exposes no
// separate binned-max field). Binning changes reset the window to full
// frame at the new scale rather than trying to rescale an existing crop
// that may no longer fit — camerawidget.py does the same, wiring
// comboBinning.currentTextChanged straight to set_full_frame().
type WindowFullFrame = { x: number; y: number; width: number; height: number }
function windowFullFrame(capabilities: Record<string, unknown> | undefined): WindowFullFrame | undefined {
  const caps = capabilities as Partial<Record<'full_frame_x' | 'full_frame_y' | 'full_frame_width' | 'full_frame_height', number>> | undefined
  const { full_frame_x, full_frame_y, full_frame_width, full_frame_height } = caps ?? {}
  if (
    typeof full_frame_x !== 'number' ||
    typeof full_frame_y !== 'number' ||
    typeof full_frame_width !== 'number' ||
    typeof full_frame_height !== 'number'
  ) {
    return undefined
  }
  return { x: full_frame_x, y: full_frame_y, width: full_frame_width, height: full_frame_height }
}

const currentBinning = computed(() => {
  const x = Number(settingsParams.value['x'])
  const y = Number(settingsParams.value['y'])
  return { x: x > 0 ? x : 1, y: y > 0 ? y : 1 }
})

const windowLimits = computed(() => {
  const group = settingsGroups.value.find((g) => g.key === 'window')
  const full = windowFullFrame(group?.capabilities)
  if (!full) return undefined
  const bin = currentBinning.value
  const maxWidth = Math.floor(full.width / bin.x)
  const maxHeight = Math.floor(full.height / bin.y)
  return {
    left: { min: 0, max: maxWidth },
    top: { min: 0, max: maxHeight },
    width: { min: 0, max: maxWidth },
    height: { min: 0, max: maxHeight },
  }
})

function resetWindowToFullFrame() {
  const group = settingsGroups.value.find((g) => g.key === 'window')
  const full = windowFullFrame(group?.capabilities)
  if (!full) return
  const bin = currentBinning.value
  settingsParams.value = {
    ...settingsParams.value,
    left: String(full.x),
    top: String(full.y),
    width: String(Math.floor(full.width / bin.x)),
    height: String(Math.floor(full.height / bin.y)),
  }
}

// Above-FitsCanvas groups: set before every Expose. Everything else (window,
// binning, image format, gain) renders below — touched far less often.
const TOP_GROUP_KEYS = ['exposureTime', 'imageType']
const topSettingsGroups = computed(() => settingsGroups.value.filter((g) => TOP_GROUP_KEYS.includes(g.key)))
const bottomSettingsGroups = computed(() => settingsGroups.value.filter((g) => !TOP_GROUP_KEYS.includes(g.key)))

const settingsParams = ref<Record<string, string>>({})

// defaultParamValue() already seeds required numbers/enums/bools with a
// real value (see #42) — needed here because, unlike Shell where a human
// reviews params before Execute, Expose is meant to work with no
// Settings-panel visit at all, so every required field must resolve to
// something the server will accept, not a blank/zero guess. Window and
// binning go further and use the module's actually-advertised capabilities
// instead of a generic guess (IWindow's width/height defaulting to '0'
// crashed grab_data() with a zero-size-array error deep in DummyCamera's
// image generation) — still not the module's actual *current* value (that
// would need subscribing to each interface's state, matching pyobs-gui's
// camerawidget.py _init() — not done here, left for a follow-up if these
// guessed defaults prove confusing in practice).
function seedFieldValue(groups: SettingsGroup[], group: SettingsGroup, field: FieldSchema): string {
  if (group.key === 'window') {
    const full = windowFullFrame(group.capabilities)
    if (full) {
      const binningGroup = groups.find((g) => g.key === 'binning')
      const bin = binningOptions(binningGroup?.capabilities)?.[0] ?? { x: 1, y: 1 }
      if (field.name === 'left') return String(full.x)
      if (field.name === 'top') return String(full.y)
      if (field.name === 'width') return String(Math.floor(full.width / bin.x))
      if (field.name === 'height') return String(Math.floor(full.height / bin.y))
    }
  }
  if (group.key === 'binning' && (field.name === 'x' || field.name === 'y')) {
    const first = binningOptions(group.capabilities)?.[0]
    return first ? String(first[field.name]) : '1'
  }

  return defaultParamValue(field.type, group.enums)
}

watch(
  settingsGroups,
  (groups) => {
    settingsParams.value = Object.fromEntries(groups.flatMap((g) => g.fields.map((f) => [f.name, seedFieldValue(groups, g, f)])))
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
        <div class="d-flex align-items-center justify-content-between mb-1">
          <div class="text-muted fw-semibold" style="font-size:0.75rem">{{ group.title }}</div>
          <button
            v-if="group.key === 'window' && windowFullFrame(group.capabilities)"
            type="button"
            class="btn btn-outline-secondary btn-sm py-0 px-1"
            style="font-size:0.7rem"
            :data-testid="`camera-settings-window-full-frame`"
            @click="resetWindowToFullFrame"
          >
            Full frame
          </button>
        </div>
        <select
          v-if="group.key === 'binning' && binningOptions(group.capabilities)"
          v-model="binningSelection"
          class="form-select form-select-sm bg-dark border-secondary text-light"
          :data-testid="`camera-settings-${group.key}`"
        >
          <option v-for="b in binningOptions(group.capabilities)" :key="`${b.x}x${b.y}`" :value="`${b.x}x${b.y}`">{{ b.x }}x{{ b.y }}</option>
        </select>
        <ParamForm
          v-else
          v-model="settingsParams"
          :fields="group.fields"
          :enums="group.enums"
          :limits="group.key === 'window' ? windowLimits : undefined"
          compact
          :testid="`camera-settings-${group.key}`"
        />
      </div>
    </div>
  </div>
</template>
