<script setup lang="ts">
import { ref, computed, watch, watchEffect, type DeepReadonly } from 'vue'
import { useXmpp, type PyobsModule } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import { defaultParamValue, paramValueFromString } from '@/pyobs-codec'
import { raDecToAltAz, altAzToRaDec, type GeoLocation } from '@/utils/astroCoords'
import ModuleStateCard from '@/components/ModuleStateCard.vue'
import ParamForm from '@/components/ParamForm.vue'

// One tab on ModulePageView.vue, not its own routed page — jid is already
// resolved and guaranteed to implement ITelescope (see moduleWidgets.ts) and
// be online (ModulePageView's own guard) by the time this renders. See
// specs/plans/2026-09-06-module-page-rework.md.
const props = defineProps<{ jid: string }>()
const { modules, executeMethod } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

// ── Init/Park/Stop (IMotion, every ITelescope module has it) ───────────────

type MotionAction = 'init' | 'park' | 'stop_motion'

const motionRunning = ref<Record<string, MotionAction>>({}) // jid -> action in flight
const motionErrors = ref<Record<string, string>>({}) // jid -> last error, if any

async function runMotion(mod: DeepReadonly<PyobsModule>, action: MotionAction) {
  const schema = mod.interfaces['IMotion']?.commands[action] as CommandSchema | undefined
  if (!schema) return

  motionRunning.value = { ...motionRunning.value, [mod.jid]: action }
  motionErrors.value = { ...motionErrors.value, [mod.jid]: '' }
  try {
    const result = await executeMethod(mod.fullJid, action, schema.params.map(() => null), schema)
    if (!result.success) {
      motionErrors.value = {
        ...motionErrors.value,
        [mod.jid]: `${result.errorClass ? `${result.errorClass}: ` : ''}${String(result.value)}`,
      }
    }
  } catch (e) {
    motionErrors.value = { ...motionErrors.value, [mod.jid]: String(e) }
  } finally {
    const next = { ...motionRunning.value }
    delete next[mod.jid]
    motionRunning.value = next
  }
}

// ── Pointing/offset/tracking commands (per-tab sections below) ─────────────
// This component only ever shows one module's commands at a time, and every
// command name used here (move_radec, move_altaz, set_offsets_radec,
// set_offsets_altaz, set_tracking_rate, track_body, set_tracking_mode) is
// unique across the interfaces involved, so plain command-name keys are
// enough — no iface qualifier needed.

// A total mapped type (every command always has an entry, empty or
// populated) rather than a generic string index signature — so template
// bindings like `paramValues.move_radec` are never `| undefined` to
// TypeScript, regardless of whether the current module implements it.
type CommandName =
  | 'move_radec'
  | 'set_offsets_radec'
  | 'move_altaz'
  | 'set_offsets_altaz'
  | 'set_tracking_mode'
  | 'set_tracking_rate'
  | 'track_body'

const COMMANDS: Array<{ iface: string; name: CommandName }> = [
  { iface: 'IPointingRaDec', name: 'move_radec' },
  { iface: 'IOffsetsRaDec', name: 'set_offsets_radec' },
  { iface: 'IPointingAltAz', name: 'move_altaz' },
  { iface: 'IOffsetsAltAz', name: 'set_offsets_altaz' },
  { iface: 'ITrackingMode', name: 'set_tracking_mode' },
  { iface: 'ITrackingRate', name: 'set_tracking_rate' },
  { iface: 'IPointingBody', name: 'track_body' },
]

function emptyParamValues(): Record<CommandName, Record<string, string>> {
  return Object.fromEntries(COMMANDS.map(({ name }) => [name, {}])) as Record<CommandName, Record<string, string>>
}

const paramValues = ref<Record<CommandName, Record<string, string>>>(emptyParamValues())
const commandRunning = ref<Record<string, boolean>>({}) // `${jid}:${command}` -> in flight
const commandErrors = ref<Record<string, string>>({}) // `${jid}:${command}` -> last error, if any

// Reset every command's param values when the module changes (jid is a
// static prop in practice, but defensive against a jid change all the
// same), so a stale value never lingers into a module that doesn't even
// have that field.
watch(
  currentModule,
  (mod) => {
    const next = emptyParamValues()
    if (mod) {
      for (const { iface, name } of COMMANDS) {
        const schema = mod.interfaces[iface]?.commands[name] as CommandSchema | undefined
        if (schema) next[name] = Object.fromEntries(schema.params.map((p) => [p.name, defaultParamValue(p.type)]))
      }
    }
    paramValues.value = next
  },
  { immediate: true },
)

async function runCommand(mod: DeepReadonly<PyobsModule>, iface: string, name: CommandName) {
  const schema = mod.interfaces[iface]?.commands[name] as CommandSchema | undefined
  const values = paramValues.value[name]
  if (!schema) return

  const key = `${mod.jid}:${name}`
  commandRunning.value = { ...commandRunning.value, [key]: true }
  commandErrors.value = { ...commandErrors.value, [key]: '' }
  try {
    const params = schema.params.map((p) => paramValueFromString(values[p.name], p.type))
    const result = await executeMethod(mod.fullJid, name, params, schema)
    if (!result.success) {
      commandErrors.value = {
        ...commandErrors.value,
        [key]: `${result.errorClass ? `${result.errorClass}: ` : ''}${String(result.value)}`,
      }
    }
  } catch (e) {
    commandErrors.value = { ...commandErrors.value, [key]: String(e) }
  } finally {
    const next = { ...commandRunning.value }
    delete next[key]
    commandRunning.value = next
  }
}

// ── Sections: RA/Dec, Alt/Az, Tracking — only shown as tabs when a module
// implements more than one; a module implementing exactly one renders it
// directly with no tab bar. Deliberately a plain button toggle (not
// Bootstrap `nav nav-tabs`) so it reads as a distinct, nested level from
// ModulePageView.vue's own outer per-widget tab strip.

type SectionKind = 'radec' | 'altaz' | 'tracking'
const SECTION_LABELS: Record<SectionKind, string> = { radec: 'RA/Dec', altaz: 'Alt/Az', tracking: 'Tracking' }

const applicableSections = computed((): SectionKind[] => {
  const mod = currentModule.value
  if (!mod) return []
  const sections: SectionKind[] = []
  if (mod.interfaces['IPointingRaDec']) sections.push('radec')
  if (mod.interfaces['IPointingAltAz']) sections.push('altaz')
  if (mod.interfaces['ITrackingMode'] || mod.interfaces['ITrackingRate'] || mod.interfaces['IPointingBody']) {
    sections.push('tracking')
  }
  return sections
})

const activeSection = ref<SectionKind | undefined>(undefined)

watchEffect(() => {
  if (applicableSections.value.length > 0 && !applicableSections.value.includes(activeSection.value as SectionKind)) {
    activeSection.value = applicableSections.value[0]
  }
})

// ── Destination preview: where a typed RA/Dec or Alt/Az destination actually
// points to right now, using the module's own reported observer location.
// Approximate — see astroCoords.ts — not used for the actual Move call.

const moduleLocation = computed((): GeoLocation | null => {
  const loc = currentModule.value?.capabilities['IModule']?.location as
    | { longitude: number; latitude: number }
    | null
    | undefined
  return loc ? { longitudeDeg: loc.longitude, latitudeDeg: loc.latitude } : null
})

const raDecPreview = computed(() => {
  if (!moduleLocation.value) return null
  const ra = Number(paramValues.value.move_radec?.ra)
  const dec = Number(paramValues.value.move_radec?.dec)
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null
  return raDecToAltAz({ raDeg: ra, decDeg: dec }, moduleLocation.value, new Date())
})

const altAzPreview = computed(() => {
  if (!moduleLocation.value) return null
  const alt = Number(paramValues.value.move_altaz?.alt)
  const az = Number(paramValues.value.move_altaz?.az)
  if (!Number.isFinite(alt) || !Number.isFinite(az)) return null
  return altAzToRaDec({ altDeg: alt, azDeg: az }, moduleLocation.value, new Date())
})

// ── ITrackingMode's mode selector: restrict to this module's own
// TrackingModeCapabilities.modes when it publishes them (a driver may only
// support a subset of the enum's full member list), else fall back to the
// full enum from schema.

const trackingModeEnums = computed((): Record<string, string[]> => {
  const mod = currentModule.value
  if (!mod) return {}
  const schemaEnums = (mod.interfaces['ITrackingMode']?.enums ?? {}) as Record<string, string[]>
  const capModes = mod.capabilities['ITrackingMode']?.modes as string[] | undefined
  return capModes ? { ...schemaEnums, TrackingMode: capModes } : schemaEnums
})

// Cast-through computeds for each command's schema: `currentModule` is
// DeepReadonly (see RoofView.vue's same pattern), but ParamForm's `fields`
// prop needs plain mutable FieldSchema[] — same cast ShellView.vue's own
// `currentCommandSchema`/`currentEnums` computeds already do.
const moveRaDecSchema = computed(
  () => currentModule.value?.interfaces['IPointingRaDec']?.commands['move_radec'] as CommandSchema | undefined,
)
const offsetsRaDecSchema = computed(
  () => currentModule.value?.interfaces['IOffsetsRaDec']?.commands['set_offsets_radec'] as CommandSchema | undefined,
)
const moveAltAzSchema = computed(
  () => currentModule.value?.interfaces['IPointingAltAz']?.commands['move_altaz'] as CommandSchema | undefined,
)
const offsetsAltAzSchema = computed(
  () => currentModule.value?.interfaces['IOffsetsAltAz']?.commands['set_offsets_altaz'] as CommandSchema | undefined,
)
const trackingModeSchema = computed(
  () => currentModule.value?.interfaces['ITrackingMode']?.commands['set_tracking_mode'] as CommandSchema | undefined,
)
const trackingRateSchema = computed(
  () => currentModule.value?.interfaces['ITrackingRate']?.commands['set_tracking_rate'] as CommandSchema | undefined,
)
const trackBodySchema = computed(
  () => currentModule.value?.interfaces['IPointingBody']?.commands['track_body'] as CommandSchema | undefined,
)
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <ModuleStateCard
      :jid="currentModule.jid"
      interface-name="IMotion"
      :version="currentModule.interfaces['IMotion']!.version"
      title="Status"
    />

    <div class="d-flex flex-wrap gap-2 mt-2">
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!!motionRunning[currentModule.jid]"
        @click="runMotion(currentModule, 'init')"
      >
        <span v-if="motionRunning[currentModule.jid] === 'init'" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Init
      </button>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!!motionRunning[currentModule.jid]"
        @click="runMotion(currentModule, 'park')"
      >
        <span v-if="motionRunning[currentModule.jid] === 'park'" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Park
      </button>
      <button
        type="button"
        class="btn btn-outline-danger btn-sm"
        :disabled="!!motionRunning[currentModule.jid]"
        @click="runMotion(currentModule, 'stop_motion')"
      >
        <span v-if="motionRunning[currentModule.jid] === 'stop_motion'" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Stop
      </button>
    </div>

    <div v-if="motionErrors[currentModule.jid]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
      {{ motionErrors[currentModule.jid] }}
    </div>

    <div v-if="applicableSections.length > 0" class="rounded-3 p-3 pyobs-panel mt-2">
      <div v-if="applicableSections.length > 1" class="d-flex flex-wrap gap-2 mb-3">
        <button
          v-for="section in applicableSections"
          :key="section"
          type="button"
          class="btn btn-sm"
          :class="activeSection === section ? 'btn-primary' : 'btn-outline-secondary'"
          @click="activeSection = section"
        >
          {{ SECTION_LABELS[section] }}
        </button>
      </div>

      <!-- RA/Dec -->
      <template v-if="activeSection === 'radec'">
        <div v-if="currentModule.interfaces['IPointingRaDec']?.state">
          <ModuleStateCard
            :jid="currentModule.jid"
            interface-name="IPointingRaDec"
            :version="currentModule.interfaces['IPointingRaDec']!.version"
            title="Position"
          />
        </div>
        <ParamForm v-model="paramValues.move_radec" :fields="moveRaDecSchema!.params" :enums="{}" />
        <div v-if="paramValues.move_radec?.ra && paramValues.move_radec?.dec" class="text-muted mb-2" style="font-size:0.8rem">
          <template v-if="raDecPreview">→ Alt {{ raDecPreview.altDeg.toFixed(1) }}°, Az {{ raDecPreview.azDeg.toFixed(1) }}°</template>
          <template v-else-if="!moduleLocation">this telescope module did not report an observer location — preview unavailable</template>
        </div>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="!!commandRunning[`${currentModule.jid}:move_radec`]"
          @click="runCommand(currentModule, 'IPointingRaDec', 'move_radec')"
        >
          <span v-if="commandRunning[`${currentModule.jid}:move_radec`]" class="spinner-border spinner-border-sm me-1" role="status"></span>
          Move
        </button>
        <div v-if="commandErrors[`${currentModule.jid}:move_radec`]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
          {{ commandErrors[`${currentModule.jid}:move_radec`] }}
        </div>

        <template v-if="currentModule.interfaces['IOffsetsRaDec']">
          <hr class="my-3" />
          <div class="text-muted mb-1 text-uppercase" style="font-size:0.65rem; letter-spacing:.06em">Offset</div>
          <ModuleStateCard
            v-if="currentModule.interfaces['IOffsetsRaDec']?.state"
            :jid="currentModule.jid"
            interface-name="IOffsetsRaDec"
            :version="currentModule.interfaces['IOffsetsRaDec']!.version"
            title="Current offset"
          />
          <ParamForm v-model="paramValues.set_offsets_radec" :fields="offsetsRaDecSchema!.params" :enums="{}" />
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="!!commandRunning[`${currentModule.jid}:set_offsets_radec`]"
            @click="runCommand(currentModule, 'IOffsetsRaDec', 'set_offsets_radec')"
          >
            <span v-if="commandRunning[`${currentModule.jid}:set_offsets_radec`]" class="spinner-border spinner-border-sm me-1" role="status"></span>
            Offset
          </button>
          <div v-if="commandErrors[`${currentModule.jid}:set_offsets_radec`]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
            {{ commandErrors[`${currentModule.jid}:set_offsets_radec`] }}
          </div>
        </template>
      </template>

      <!-- Alt/Az -->
      <template v-else-if="activeSection === 'altaz'">
        <div v-if="currentModule.interfaces['IPointingAltAz']?.state">
          <ModuleStateCard
            :jid="currentModule.jid"
            interface-name="IPointingAltAz"
            :version="currentModule.interfaces['IPointingAltAz']!.version"
            title="Position"
          />
        </div>
        <ParamForm v-model="paramValues.move_altaz" :fields="moveAltAzSchema!.params" :enums="{}" />
        <div v-if="paramValues.move_altaz?.alt && paramValues.move_altaz?.az" class="text-muted mb-2" style="font-size:0.8rem">
          <template v-if="altAzPreview">→ RA {{ altAzPreview.raDeg.toFixed(1) }}°, Dec {{ altAzPreview.decDeg.toFixed(1) }}°</template>
          <template v-else-if="!moduleLocation">this telescope module did not report an observer location — preview unavailable</template>
        </div>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="!!commandRunning[`${currentModule.jid}:move_altaz`]"
          @click="runCommand(currentModule, 'IPointingAltAz', 'move_altaz')"
        >
          <span v-if="commandRunning[`${currentModule.jid}:move_altaz`]" class="spinner-border spinner-border-sm me-1" role="status"></span>
          Move
        </button>
        <div v-if="commandErrors[`${currentModule.jid}:move_altaz`]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
          {{ commandErrors[`${currentModule.jid}:move_altaz`] }}
        </div>

        <template v-if="currentModule.interfaces['IOffsetsAltAz']">
          <hr class="my-3" />
          <div class="text-muted mb-1 text-uppercase" style="font-size:0.65rem; letter-spacing:.06em">Offset</div>
          <ModuleStateCard
            v-if="currentModule.interfaces['IOffsetsAltAz']?.state"
            :jid="currentModule.jid"
            interface-name="IOffsetsAltAz"
            :version="currentModule.interfaces['IOffsetsAltAz']!.version"
            title="Current offset"
          />
          <ParamForm v-model="paramValues.set_offsets_altaz" :fields="offsetsAltAzSchema!.params" :enums="{}" />
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="!!commandRunning[`${currentModule.jid}:set_offsets_altaz`]"
            @click="runCommand(currentModule, 'IOffsetsAltAz', 'set_offsets_altaz')"
          >
            <span v-if="commandRunning[`${currentModule.jid}:set_offsets_altaz`]" class="spinner-border spinner-border-sm me-1" role="status"></span>
            Offset
          </button>
          <div v-if="commandErrors[`${currentModule.jid}:set_offsets_altaz`]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
            {{ commandErrors[`${currentModule.jid}:set_offsets_altaz`] }}
          </div>
        </template>
      </template>

      <!-- Tracking: mode / rate / named body -->
      <template v-else-if="activeSection === 'tracking'">
        <template v-if="currentModule.interfaces['ITrackingMode']">
          <div class="text-muted mb-1 text-uppercase" style="font-size:0.65rem; letter-spacing:.06em">Mode</div>
          <ModuleStateCard
            v-if="currentModule.interfaces['ITrackingMode']?.state"
            :jid="currentModule.jid"
            interface-name="ITrackingMode"
            :version="currentModule.interfaces['ITrackingMode']!.version"
            title="Current mode"
          />
          <ParamForm v-model="paramValues.set_tracking_mode" :fields="trackingModeSchema!.params" :enums="trackingModeEnums" />
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="!!commandRunning[`${currentModule.jid}:set_tracking_mode`]"
            @click="runCommand(currentModule, 'ITrackingMode', 'set_tracking_mode')"
          >
            <span v-if="commandRunning[`${currentModule.jid}:set_tracking_mode`]" class="spinner-border spinner-border-sm me-1" role="status"></span>
            Set Mode
          </button>
          <div v-if="commandErrors[`${currentModule.jid}:set_tracking_mode`]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
            {{ commandErrors[`${currentModule.jid}:set_tracking_mode`] }}
          </div>
        </template>

        <template v-if="currentModule.interfaces['ITrackingRate']">
          <hr v-if="currentModule.interfaces['ITrackingMode']" class="my-3" />
          <div class="text-muted mb-1 text-uppercase" style="font-size:0.65rem; letter-spacing:.06em">Rate</div>
          <ModuleStateCard
            v-if="currentModule.interfaces['ITrackingRate']?.state"
            :jid="currentModule.jid"
            interface-name="ITrackingRate"
            :version="currentModule.interfaces['ITrackingRate']!.version"
            title="Current rate"
          />
          <ParamForm v-model="paramValues.set_tracking_rate" :fields="trackingRateSchema!.params" :enums="{}" />
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="!!commandRunning[`${currentModule.jid}:set_tracking_rate`]"
            @click="runCommand(currentModule, 'ITrackingRate', 'set_tracking_rate')"
          >
            <span v-if="commandRunning[`${currentModule.jid}:set_tracking_rate`]" class="spinner-border spinner-border-sm me-1" role="status"></span>
            Set Rate
          </button>
          <div v-if="commandErrors[`${currentModule.jid}:set_tracking_rate`]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
            {{ commandErrors[`${currentModule.jid}:set_tracking_rate`] }}
          </div>
        </template>

        <template v-if="currentModule.interfaces['IPointingBody']">
          <hr v-if="currentModule.interfaces['ITrackingMode'] || currentModule.interfaces['ITrackingRate']" class="my-3" />
          <div class="text-muted mb-1 text-uppercase" style="font-size:0.65rem; letter-spacing:.06em">Track named body</div>
          <ParamForm v-model="paramValues.track_body" :fields="trackBodySchema!.params" :enums="{}" />
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="!!commandRunning[`${currentModule.jid}:track_body`]"
            @click="runCommand(currentModule, 'IPointingBody', 'track_body')"
          >
            <span v-if="commandRunning[`${currentModule.jid}:track_body`]" class="spinner-border spinner-border-sm me-1" role="status"></span>
            Track
          </button>
          <div v-if="commandErrors[`${currentModule.jid}:track_body`]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
            {{ commandErrors[`${currentModule.jid}:track_body`] }}
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
