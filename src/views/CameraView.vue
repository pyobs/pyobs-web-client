<script setup lang="ts">
// Phase 2 of specs/plans/camera-page.md: CameraView.vue + Expose button,
// wired to a live grab_data() call and the phase 1 FitsCanvas widget.
// Single-shot only (no IDataSequence), own-triggered images only (no
// NewImageEvent subscription) — see the plan's Phase 2 section for why.
//
// Phase 3: dedicated IWindow/IBinning/IGain/IImageFormat/IExposureTime/
// IImageType controls, in a collapsible "Settings" panel — reverses the
// plan's original call to leave these to Shell (see Phase 3's "Scope
// reversal" note). Deliberately *not* one Set button per interface
// (considered and rejected — six independent buttons is worse UX than one
// combined form): settings are staged in one form and applied, one RPC per
// configured interface, immediately before each grab_data() call, matching
// pyobs-gui's camerawidget.py:271-330. IFilters deferred — no live module
// implements it to verify against yet.
import { ref, computed, watch, watchEffect, type DeepReadonly } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useXmpp, type PyobsModule } from '@/composables/useXmpp'
import { useVfsConfig } from '@/composables/useVfsConfig'
import {
  defaultParamValue,
  enumOptions,
  hasUnsupportedField,
  paramValueFromString,
  unwrapOptional,
  type CommandSchema,
  type FieldSchema,
} from '@/pyobs-codec'
import ModuleStateCard from '@/components/ModuleStateCard.vue'
import FitsCanvas from '@/components/FitsCanvas.vue'
import ParamForm from '@/components/ParamForm.vue'

const route = useRoute()
const router = useRouter()
const { modules, executeMethod } = useXmpp()
const { resolveVfsEndpoint } = useVfsConfig()

const cameraModules = computed(() =>
  modules.value.filter((m) => 'ICamera' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)

const routeJid = computed(() => route.params.jid as string | undefined)

const currentModule = computed(() =>
  routeJid.value ? cameraModules.value.find((m) => m.jid === routeJid.value) : undefined,
)

watchEffect(() => {
  if (!routeJid.value && cameraModules.value.length > 0) {
    router.replace({ name: 'camera', params: { jid: cameraModules.value[0]!.jid } })
  }
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

const showSettings = ref(false)
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
    const resolved = resolveVfsEndpoint(path)
    if (!resolved) {
      errors.value = {
        ...errors.value,
        [mod.jid]: `No VFS endpoint configured for "${path}" — add one in Settings.`,
      }
      return
    }

    const headers: HeadersInit = {}
    if (resolved.endpoint.username) {
      headers['Authorization'] = `Basic ${btoa(`${resolved.endpoint.username}:${resolved.endpoint.password ?? ''}`)}`
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
  <div style="max-width: 800px">
    <h5 class="text-body fw-semibold mb-4">Camera</h5>

    <div v-if="cameraModules.length === 0" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      No ICamera modules online.
    </div>

    <div v-else-if="!currentModule" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      Camera module{{ routeJid ? ` "${routeJid}"` : '' }} is not online.
    </div>

    <div v-else class="d-flex flex-column gap-2">
      <div
        :key="currentModule.jid"
        class="rounded-3 p-3 pyobs-panel"
      >
        <div class="d-flex align-items-center gap-2 mb-2">
          <span class="status-dot online flex-shrink-0"></span>
          <span class="text-body fw-semibold" style="font-size:0.9rem">{{ currentModule.name }}</span>
          <span class="text-muted" style="font-size:0.75rem">{{ currentModule.jid }}</span>
        </div>

        <ModuleStateCard
          v-if="currentModule.interfaces['IExposure']"
          :jid="currentModule.jid"
          interface-name="IExposure"
          :version="currentModule.interfaces['IExposure'].version"
          title="Exposure"
        />

        <div v-if="settingsGroups.length > 0" class="mt-2">
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            @click="showSettings = !showSettings"
          >
            <i class="bi" :class="showSettings ? 'bi-chevron-down' : 'bi-chevron-right'"></i>
            Settings
          </button>

          <div v-if="showSettings" class="mt-2 rounded-3 p-3 pyobs-panel-alt">
            <div v-for="group in settingsGroups" :key="group.key" class="mb-2">
              <div class="text-muted fw-semibold mb-1" style="font-size:0.75rem">{{ group.title }}</div>
              <ParamForm v-model="settingsParams" :fields="group.fields" :enums="group.enums" :testid="`camera-settings-${group.key}`" />
            </div>
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="!!exposing[currentModule.jid] || hasUnsupportedSettingsField"
            @click="expose(currentModule)"
          >
            <span v-if="exposing[currentModule.jid]" class="spinner-border spinner-border-sm me-1" role="status"></span>
            Expose
          </button>
        </div>

        <div v-if="errors[currentModule.jid]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
          {{ errors[currentModule.jid] }}
        </div>

        <FitsCanvas v-if="images[currentModule.jid]" class="mt-2" :data="images[currentModule.jid]!" />
      </div>
    </div>
  </div>
</template>
