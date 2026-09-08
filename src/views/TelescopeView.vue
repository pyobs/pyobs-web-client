<script setup lang="ts">
import { ref, computed, watch, watchEffect, onUnmounted, type DeepReadonly } from 'vue'
import { useXmpp, type PyobsModule } from '@/composables/useXmpp'
import { useConfirmArm } from '@/composables/useConfirmArm'
import type { CommandSchema } from '@/pyobs-codec'
import { defaultParamValue, paramValueFromString } from '@/pyobs-codec'
import {
  raDecToAltAz,
  altAzToRaDec,
  formatRaSexagesimal,
  formatDecSexagesimal,
  parseRaSexagesimal,
  parseDecSexagesimal,
  type GeoLocation,
} from '@/utils/astroCoords'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import StatusRow from '@/components/StatusRow.vue'
import ParamForm from '@/components/ParamForm.vue'

// One tab on ModulePageView.vue, not its own routed page — jid is already
// resolved and guaranteed to implement ITelescope (see moduleWidgets.ts) and
// be online (ModulePageView's own guard) by the time this renders. See
// specs/plans/2026-09-06-module-page-rework.md.
const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()

// Tap-to-arm confirmation for motion/offset commands — see #38. Deliberately
// not applied to Stop (an emergency-stop-shaped action shouldn't get extra
// friction) or to reading/tab-switching.
const confirmArm = useConfirmArm()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

// ── Curated status — IMotion's `status`, plus the active section's own
// position (RA/Dec or Alt/Az, formatted sexagesimal/degrees per the mockup),
// replacing the raw ModuleStateCard dumps that used to cover each interface's
// full state object. See specs/plans/2026-09-07-widget-visual-redesign.md.

type MotionState = { status: string }
type RaDecState = { ra: number; dec: number }
type AltAzState = { alt: number; az: number }
type RaDecOffsetState = { ra: number; dec: number }
type AltAzOffsetState = { alt: number; az: number }
type TrackingModeState = { mode: string }
type TrackingRateState = { ra_rate: number; dec_rate: number }

const motionStateValue = ref<MotionState | undefined>(undefined)
const raDecStateValue = ref<RaDecState | undefined>(undefined)
const altAzStateValue = ref<AltAzState | undefined>(undefined)
const raDecOffsetStateValue = ref<RaDecOffsetState | undefined>(undefined)
const altAzOffsetStateValue = ref<AltAzOffsetState | undefined>(undefined)
const trackingModeStateValue = ref<TrackingModeState | undefined>(undefined)
const trackingRateStateValue = ref<TrackingRateState | undefined>(undefined)
let stopStatusSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopStatusSubscription?.()
    stopStatusSubscription = undefined
    motionStateValue.value = undefined
    raDecStateValue.value = undefined
    altAzStateValue.value = undefined
    raDecOffsetStateValue.value = undefined
    altAzOffsetStateValue.value = undefined
    trackingModeStateValue.value = undefined
    trackingRateStateValue.value = undefined

    if (!mod) return
    const stops: (() => void)[] = []

    const motionVersion = mod.interfaces['IMotion']?.version
    if (motionVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IMotion', motionVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (motionStateValue.value = v as MotionState | undefined), { immediate: true }))
    }

    const raDecVersion = mod.interfaces['IPointingRaDec']?.version
    if (raDecVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IPointingRaDec', raDecVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (raDecStateValue.value = v as RaDecState | undefined), { immediate: true }))
    }

    const altAzVersion = mod.interfaces['IPointingAltAz']?.version
    if (altAzVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IPointingAltAz', altAzVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (altAzStateValue.value = v as AltAzState | undefined), { immediate: true }))
    }

    const raDecOffsetVersion = mod.interfaces['IOffsetsRaDec']?.version
    if (raDecOffsetVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IOffsetsRaDec', raDecOffsetVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (raDecOffsetStateValue.value = v as RaDecOffsetState | undefined), { immediate: true }))
    }

    const altAzOffsetVersion = mod.interfaces['IOffsetsAltAz']?.version
    if (altAzOffsetVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IOffsetsAltAz', altAzOffsetVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (altAzOffsetStateValue.value = v as AltAzOffsetState | undefined), { immediate: true }))
    }

    const trackingModeVersion = mod.interfaces['ITrackingMode']?.version
    if (trackingModeVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'ITrackingMode', trackingModeVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (trackingModeStateValue.value = v as TrackingModeState | undefined), { immediate: true }))
    }

    const trackingRateVersion = mod.interfaces['ITrackingRate']?.version
    if (trackingRateVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'ITrackingRate', trackingRateVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (trackingRateStateValue.value = v as TrackingRateState | undefined), { immediate: true }))
    }

    stopStatusSubscription = () => stops.forEach((stop) => stop())
  },
  { immediate: true },
)

onUnmounted(() => stopStatusSubscription?.())

const motionStatusFields = computed(() => {
  const status = motionStateValue.value?.status
  if (!status) return []
  return [{ label: 'Status', value: status.charAt(0).toUpperCase() + status.slice(1) }]
})

const raDecPositionFields = computed(() => {
  const state = raDecStateValue.value
  if (!state) return []
  return [
    { label: 'RA', value: formatRaSexagesimal(state.ra) },
    { label: 'Dec', value: formatDecSexagesimal(state.dec) },
  ]
})

const altAzPositionFields = computed(() => {
  const state = altAzStateValue.value
  if (!state) return []
  return [
    { label: 'Alt', value: `${state.alt.toFixed(1)}°` },
    { label: 'Az', value: `${state.az.toFixed(1)}°` },
  ]
})

// Offset/tracking curated fields — matches telescopewidget.py's own labeled
// fields exactly (degrees converted to arcsec, per its own '%.2f"' format),
// replacing the raw ModuleStateCard dumps that used to show lowercase wire
// field names and an unhelpful `time` field here (see #37).
const raDecOffsetFields = computed(() => {
  const state = raDecOffsetStateValue.value
  if (!state) return []
  return [
    { label: 'RA', value: `${(state.ra * 3600).toFixed(2)}"` },
    { label: 'Dec', value: `${(state.dec * 3600).toFixed(2)}"` },
  ]
})

const altAzOffsetFields = computed(() => {
  const state = altAzOffsetStateValue.value
  if (!state) return []
  return [
    { label: 'Alt', value: `${(state.alt * 3600).toFixed(2)}"` },
    { label: 'Az', value: `${(state.az * 3600).toFixed(2)}"` },
  ]
})

const trackingModeFields = computed(() => {
  const state = trackingModeStateValue.value
  if (!state) return []
  return [{ label: 'Mode', value: state.mode.charAt(0).toUpperCase() + state.mode.slice(1) }]
})

const trackingRateFields = computed(() => {
  const state = trackingRateStateValue.value
  if (!state) return []
  return [
    { label: 'RA rate', value: `${state.ra_rate.toFixed(2)}"/s` },
    { label: 'Dec rate', value: `${state.dec_rate.toFixed(2)}"/s` },
  ]
})

// ── ACL gating: every fixed-method button below is disabled (not hidden —
// see acl-aware-shell-forms.md's "grey out, not hide") when the connected
// identity isn't permitted to call it. One flat name space covers both
// Init/Park/Stop and every tab-section command, same as `runCommand` below
// already assumes (pyobs-core dispatches by bare method name regardless of
// which interface declares it).

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

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

// ── Target name lookup (Simbad) — fills the RA/Dec move fields. See #35.
// telescopewidget.py uses astroquery.simbad (Python-only); this uses SIMBAD's
// own TAP sync HTTP endpoint directly (CORS-enabled, verified) instead.
const simbadName = ref('')
const simbadSearching = ref(false)
const simbadError = ref('')

async function searchSimbad() {
  const name = simbadName.value.trim()
  if (!name) return

  simbadSearching.value = true
  simbadError.value = ''
  try {
    // Single quotes doubled per standard ADQL/SQL string-literal escaping —
    // the name is otherwise embedded verbatim in the query string.
    const escaped = name.replace(/'/g, "''")
    const query = `SELECT ra, dec, main_id FROM basic JOIN ident ON oid=oidref WHERE id='${escaped}'`
    const url = `https://simbad.cds.unistra.fr/simbad/sim-tap/sync?request=doQuery&lang=adql&format=json&query=${encodeURIComponent(query)}`
    const response = await fetch(url)
    if (!response.ok) {
      simbadError.value = `Simbad query failed: HTTP ${response.status}`
      return
    }
    const result = (await response.json()) as { data: [number, number, string][] }
    const row = result.data[0]
    if (!row) {
      simbadError.value = `No Simbad result for "${name}".`
      return
    }
    const [ra, dec] = row
    paramValues.value.move_radec.ra = String(ra)
    paramValues.value.move_radec.dec = String(dec)
  } catch (e) {
    simbadError.value = String(e)
  } finally {
    simbadSearching.value = false
  }
}

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
        const enums = mod.interfaces[iface]?.enums as Record<string, string[]> | undefined
        if (schema) next[name] = Object.fromEntries(schema.params.map((p) => [p.name, defaultParamValue(p.type, enums)]))
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

// move_radec's RA/Dec fields accept sexagesimal text (see #36) — plain
// ParamForm/paramValueFromString only knows how to turn a string straight
// into a float64, which can't parse "12:34:56". Parse to decimal degrees
// here (rewriting the fields to show the normalized value) before handing
// off to the same generic runCommand every other command button uses.
async function moveRaDec(mod: DeepReadonly<PyobsModule>) {
  const key = `${mod.jid}:move_radec`
  const raDeg = parseRaSexagesimal(paramValues.value.move_radec.ra ?? '')
  const decDeg = parseDecSexagesimal(paramValues.value.move_radec.dec ?? '')
  if (raDeg === null || decDeg === null) {
    commandErrors.value = { ...commandErrors.value, [key]: 'Invalid RA/Dec.' }
    return
  }
  paramValues.value.move_radec.ra = String(raDeg)
  paramValues.value.move_radec.dec = String(decDeg)
  await runCommand(mod, 'IPointingRaDec', 'move_radec')
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
  const ra = parseRaSexagesimal(paramValues.value.move_radec?.ra ?? '')
  const dec = parseDecSexagesimal(paramValues.value.move_radec?.dec ?? '')
  if (ra === null || dec === null) return null
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
    <StatusRow v-if="motionStatusFields.length > 0" :fields="motionStatusFields" />

    <div class="d-flex gap-2 mt-2">
      <button
        type="button"
        class="btn btn-sm flex-fill"
        :class="confirmArm.isArmed('init') ? 'btn-warning' : 'btn-outline-secondary'"
        :disabled="!!motionRunning[currentModule.jid] || !permitted('init')"
        :title="permitted('init') ? undefined : NOT_PERMITTED_TITLE"
        @click="confirmArm.confirm('init') && runMotion(currentModule, 'init')"
      >
        <span v-if="motionRunning[currentModule.jid] === 'init'" class="spinner-border spinner-border-sm me-1" role="status"></span>
        {{ confirmArm.isArmed('init') ? 'Confirm Init?' : 'Init' }}
      </button>
      <button
        type="button"
        class="btn btn-sm flex-fill"
        :class="confirmArm.isArmed('park') ? 'btn-warning' : 'btn-outline-secondary'"
        :disabled="!!motionRunning[currentModule.jid] || !permitted('park')"
        :title="permitted('park') ? undefined : NOT_PERMITTED_TITLE"
        @click="confirmArm.confirm('park') && runMotion(currentModule, 'park')"
      >
        <span v-if="motionRunning[currentModule.jid] === 'park'" class="spinner-border spinner-border-sm me-1" role="status"></span>
        {{ confirmArm.isArmed('park') ? 'Confirm Park?' : 'Park' }}
      </button>
      <button
        type="button"
        class="btn btn-outline-danger btn-sm flex-fill"
        :disabled="!!motionRunning[currentModule.jid] || !permitted('stop_motion')"
        :title="permitted('stop_motion') ? undefined : NOT_PERMITTED_TITLE"
        @click="runMotion(currentModule, 'stop_motion')"
      >
        <span v-if="motionRunning[currentModule.jid] === 'stop_motion'" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Stop
      </button>
    </div>

    <div v-if="motionErrors[currentModule.jid]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
      {{ motionErrors[currentModule.jid] }}
    </div>

    <div v-if="applicableSections.length > 0" class="pyobs-card mt-2">
      <div v-if="applicableSections.length > 1" class="d-flex gap-2 mb-3">
        <button
          v-for="section in applicableSections"
          :key="section"
          type="button"
          class="btn btn-sm flex-fill"
          :class="activeSection === section ? 'btn-primary' : 'btn-outline-secondary'"
          @click="activeSection = section"
        >
          {{ SECTION_LABELS[section] }}
        </button>
      </div>

      <!-- RA/Dec -->
      <template v-if="activeSection === 'radec'">
        <StatusRow v-if="raDecPositionFields.length > 0" :fields="raDecPositionFields" class="mb-2" />

        <div class="d-flex gap-2 align-items-end mb-2">
          <div class="flex-fill">
            <label class="text-muted d-block" style="font-size:0.7rem">Name</label>
            <input
              v-model="simbadName"
              type="text"
              class="form-control form-control-sm"
              placeholder="e.g. M31"
              @keydown.enter.prevent="searchSimbad"
            />
          </div>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="simbadSearching || !simbadName.trim()"
            @click="searchSimbad"
          >
            <span v-if="simbadSearching" class="spinner-border spinner-border-sm me-1" role="status"></span>
            Search Simbad
          </button>
        </div>
        <div v-if="simbadError" class="alert alert-danger py-1 px-2 mb-2" style="font-size:0.8rem">{{ simbadError }}</div>

        <div class="d-flex gap-2 mb-2">
          <div class="flex-fill">
            <label class="text-muted d-block" style="font-size:0.7rem">RA (hh:mm:ss or deg)</label>
            <input v-model="paramValues.move_radec.ra" type="text" class="form-control form-control-sm" placeholder="12:34:56.7" />
          </div>
          <div class="flex-fill">
            <label class="text-muted d-block" style="font-size:0.7rem">Dec (±dd:mm:ss or deg)</label>
            <input v-model="paramValues.move_radec.dec" type="text" class="form-control form-control-sm" placeholder="+45:30:00" />
          </div>
        </div>
        <div v-if="paramValues.move_radec?.ra && paramValues.move_radec?.dec" class="text-muted mb-2" style="font-size:0.8rem">
          <template v-if="raDecPreview">→ Alt {{ raDecPreview.altDeg.toFixed(1) }}°, Az {{ raDecPreview.azDeg.toFixed(1) }}°</template>
          <template v-else-if="!moduleLocation">this telescope module did not report an observer location — preview unavailable</template>
        </div>
        <button
          type="button"
          class="btn btn-sm w-100"
          :class="confirmArm.isArmed('move_radec') ? 'btn-warning' : 'btn-primary'"
          :disabled="!!commandRunning[`${currentModule.jid}:move_radec`] || !permitted('move_radec')"
          :title="permitted('move_radec') ? undefined : NOT_PERMITTED_TITLE"
          @click="confirmArm.confirm('move_radec') && moveRaDec(currentModule)"
        >
          <span v-if="commandRunning[`${currentModule.jid}:move_radec`]" class="spinner-border spinner-border-sm me-1" role="status"></span>
          {{ confirmArm.isArmed('move_radec') ? 'Confirm move?' : 'Move' }}
        </button>
        <div v-if="commandErrors[`${currentModule.jid}:move_radec`]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
          {{ commandErrors[`${currentModule.jid}:move_radec`] }}
        </div>
      </template>

      <!-- Alt/Az -->
      <template v-else-if="activeSection === 'altaz'">
        <StatusRow v-if="altAzPositionFields.length > 0" :fields="altAzPositionFields" class="mb-2" />
        <ParamForm v-model="paramValues.move_altaz" :fields="moveAltAzSchema!.params" :enums="{}" />
        <div v-if="paramValues.move_altaz?.alt && paramValues.move_altaz?.az" class="text-muted mb-2" style="font-size:0.8rem">
          <template v-if="altAzPreview">→ RA {{ altAzPreview.raDeg.toFixed(1) }}°, Dec {{ altAzPreview.decDeg.toFixed(1) }}°</template>
          <template v-else-if="!moduleLocation">this telescope module did not report an observer location — preview unavailable</template>
        </div>
        <button
          type="button"
          class="btn btn-sm w-100"
          :class="confirmArm.isArmed('move_altaz') ? 'btn-warning' : 'btn-primary'"
          :disabled="!!commandRunning[`${currentModule.jid}:move_altaz`] || !permitted('move_altaz')"
          :title="permitted('move_altaz') ? undefined : NOT_PERMITTED_TITLE"
          @click="confirmArm.confirm('move_altaz') && runCommand(currentModule, 'IPointingAltAz', 'move_altaz')"
        >
          <span v-if="commandRunning[`${currentModule.jid}:move_altaz`]" class="spinner-border spinner-border-sm me-1" role="status"></span>
          {{ confirmArm.isArmed('move_altaz') ? 'Confirm move?' : 'Move' }}
        </button>
        <div v-if="commandErrors[`${currentModule.jid}:move_altaz`]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
          {{ commandErrors[`${currentModule.jid}:move_altaz`] }}
        </div>
      </template>

      <!-- Tracking: mode / rate / named body -->
      <template v-else-if="activeSection === 'tracking'">
        <template v-if="currentModule.interfaces['ITrackingMode']">
          <div class="text-muted mb-1 text-uppercase" style="font-size:0.65rem; letter-spacing:.06em">Mode</div>
          <StatusRow v-if="trackingModeFields.length > 0" :fields="trackingModeFields" class="mb-2" />
          <ParamForm v-model="paramValues.set_tracking_mode" :fields="trackingModeSchema!.params" :enums="trackingModeEnums" />
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm w-100"
            :disabled="!!commandRunning[`${currentModule.jid}:set_tracking_mode`] || !permitted('set_tracking_mode')"
            :title="permitted('set_tracking_mode') ? undefined : NOT_PERMITTED_TITLE"
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
          <StatusRow v-if="trackingRateFields.length > 0" :fields="trackingRateFields" class="mb-2" />
          <ParamForm v-model="paramValues.set_tracking_rate" :fields="trackingRateSchema!.params" :enums="{}" />
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm w-100"
            :disabled="!!commandRunning[`${currentModule.jid}:set_tracking_rate`] || !permitted('set_tracking_rate')"
            :title="permitted('set_tracking_rate') ? undefined : NOT_PERMITTED_TITLE"
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
            class="btn btn-outline-secondary btn-sm w-100"
            :disabled="!!commandRunning[`${currentModule.jid}:track_body`] || !permitted('track_body')"
            :title="permitted('track_body') ? undefined : NOT_PERMITTED_TITLE"
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

    <!-- Offsets — independent of the RA/Dec vs Alt/Az tab above (see
         telescopewidget.py's groupEquatorialOffsets/groupHorizontalOffsets,
         each shown purely by capability, not by which move-frame tab is
         active — a module implementing both shows both, always). See #35. -->
    <div v-if="currentModule.interfaces['IOffsetsRaDec'] || currentModule.interfaces['IOffsetsAltAz']" class="pyobs-card mt-2">
      <template v-if="currentModule.interfaces['IOffsetsRaDec']">
        <div class="text-muted mb-1 text-uppercase" style="font-size:0.65rem; letter-spacing:.06em">RA/Dec offset</div>
        <StatusRow v-if="raDecOffsetFields.length > 0" :fields="raDecOffsetFields" class="mb-2" />
        <ParamForm v-model="paramValues.set_offsets_radec" :fields="offsetsRaDecSchema!.params" :enums="{}" />
        <button
          type="button"
          class="btn btn-sm w-100"
          :class="confirmArm.isArmed('set_offsets_radec') ? 'btn-warning' : 'btn-outline-secondary'"
          :disabled="!!commandRunning[`${currentModule.jid}:set_offsets_radec`] || !permitted('set_offsets_radec')"
          :title="permitted('set_offsets_radec') ? undefined : NOT_PERMITTED_TITLE"
          @click="confirmArm.confirm('set_offsets_radec') && runCommand(currentModule, 'IOffsetsRaDec', 'set_offsets_radec')"
        >
          <span v-if="commandRunning[`${currentModule.jid}:set_offsets_radec`]" class="spinner-border spinner-border-sm me-1" role="status"></span>
          {{ confirmArm.isArmed('set_offsets_radec') ? 'Confirm offset?' : 'Offset' }}
        </button>
        <div v-if="commandErrors[`${currentModule.jid}:set_offsets_radec`]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
          {{ commandErrors[`${currentModule.jid}:set_offsets_radec`] }}
        </div>
      </template>

      <template v-if="currentModule.interfaces['IOffsetsAltAz']">
        <hr v-if="currentModule.interfaces['IOffsetsRaDec']" class="my-3" />
        <div class="text-muted mb-1 text-uppercase" style="font-size:0.65rem; letter-spacing:.06em">Alt/Az offset</div>
        <StatusRow v-if="altAzOffsetFields.length > 0" :fields="altAzOffsetFields" class="mb-2" />
        <ParamForm v-model="paramValues.set_offsets_altaz" :fields="offsetsAltAzSchema!.params" :enums="{}" />
        <button
          type="button"
          class="btn btn-sm w-100"
          :class="confirmArm.isArmed('set_offsets_altaz') ? 'btn-warning' : 'btn-outline-secondary'"
          :disabled="!!commandRunning[`${currentModule.jid}:set_offsets_altaz`] || !permitted('set_offsets_altaz')"
          :title="permitted('set_offsets_altaz') ? undefined : NOT_PERMITTED_TITLE"
          @click="confirmArm.confirm('set_offsets_altaz') && runCommand(currentModule, 'IOffsetsAltAz', 'set_offsets_altaz')"
        >
          <span v-if="commandRunning[`${currentModule.jid}:set_offsets_altaz`]" class="spinner-border spinner-border-sm me-1" role="status"></span>
          {{ confirmArm.isArmed('set_offsets_altaz') ? 'Confirm offset?' : 'Offset' }}
        </button>
        <div v-if="commandErrors[`${currentModule.jid}:set_offsets_altaz`]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
          {{ commandErrors[`${currentModule.jid}:set_offsets_altaz`] }}
        </div>
      </template>
    </div>
  </div>
</template>
