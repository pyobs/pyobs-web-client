<script setup lang="ts">
// IStructuredConfig — see pyobs_gui/structuredconfigwidget.py and
// specs/plans/2026-09-07-structured-config-widget.md. Phase 1 (flat fields)
// plus Phase 2 (nested `object` fields, via the recursive
// StructConfigForm.vue) and Phase 3 (basic/expert AccessLevel toggle,
// per-field descriptions — both handled inside StructConfigForm.vue itself).
// Verified against pyobs-core's DummyStructuredConfig fixture (adapted from
// pyobs-gui/test/structuredconfig.yaml), which exercises every
// ConfigFieldSchema type at least once, including one nested field.
//
// set_config's own param can't be encoded through the usual executeMethod
// path: valueToXml has no case for a struct/dict-typed param (a command's
// wire schema never publishes struct field lists), but ConfigSchema
// (capabilities, not the command schema) gives the exact field-type tree
// this schema needs — see structValueToXml/executeMethodRaw, added
// specifically to unblock this.
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import {
  ACCESS_LEVEL_HIDDEN,
  defaultParamValue,
  paramValueFromString,
  structValueToXml,
  type ConfigFieldSchemaWire,
  type ConfigSchemaWire,
  type ConfigAppliedStateWire,
  type StructFields,
  type WireType,
} from '@/pyobs-codec'
import StructConfigForm from '@/components/StructConfigForm.vue'

const SCALAR_TYPE_MAP: Record<'str' | 'int' | 'float' | 'bool', WireType> = {
  str: 'string',
  int: 'int32',
  float: 'float64',
  bool: 'bool',
}

const props = defineProps<{ jid: string }>()
const { modules, executeMethodRaw, subscribeState } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

const configSchema = computed(() => currentModule.value?.capabilities['IStructuredConfig'] as ConfigSchemaWire | undefined)

const showExpert = ref(false)

function wireTypeFor(name: string, f: ConfigFieldSchemaWire): WireType {
  return f.type === 'enum' ? { kind: 'enum', name } : SCALAR_TYPE_MAP[f.type as 'str' | 'int' | 'float' | 'bool']
}

// Every editable scalar/enum leaf across the whole (possibly nested) schema,
// dot-path-keyed (e.g. "nested.threshold") — HIDDEN fields excluded
// regardless of showExpert (matches structuredconfigwidget.py's
// `_build_editor`, which skips HIDDEN fields entirely rather than just
// visually hiding them); EXPERT fields ARE included here even when the
// toggle is off, so switching it on doesn't reset values that were already
// seeded/edited while hidden.
type LeafField = { path: string; f: ConfigFieldSchemaWire }

function collectLeaves(fields: Record<string, ConfigFieldSchemaWire>, prefix = ''): LeafField[] {
  return Object.entries(fields).flatMap(([name, f]) => {
    if (f.level === ACCESS_LEVEL_HIDDEN) return []
    const path = `${prefix}${name}`
    if (f.type === 'object') return f.nested ? collectLeaves(f.nested, `${path}.`) : []
    return [{ path, f }]
  })
}
const leafFields = computed(() => collectLeaves(configSchema.value?.fields ?? {}))

// Opaque object fields (pydantic freeform dict, no published field list) —
// genuinely unsupported, unlike a nested-with-schema object which
// StructConfigForm.vue now renders directly. Listed for visibility, same
// spirit as pyobs-gui's always-visible-but-disabled placeholder.
function collectUnsupportedPaths(fields: Record<string, ConfigFieldSchemaWire>, prefix = ''): string[] {
  return Object.entries(fields).flatMap(([name, f]) => {
    if (f.level === ACCESS_LEVEL_HIDDEN) return []
    const path = `${prefix}${name}`
    if (f.type !== 'object') return []
    return f.nested ? collectUnsupportedPaths(f.nested, `${path}.`) : [path]
  })
}
const unsupportedFieldPaths = computed(() => collectUnsupportedPaths(configSchema.value?.fields ?? {}))

function getAtPath(obj: Record<string, unknown> | undefined, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, seg) => (cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[seg] : undefined), obj)
}
function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split('.')
  const last = segs.pop()!
  let cur = obj
  for (const seg of segs) {
    if (typeof cur[seg] !== 'object' || cur[seg] === null) cur[seg] = {}
    cur = cur[seg] as Record<string, unknown>
  }
  cur[last] = value
}

function toStructFields(fields: Record<string, ConfigFieldSchemaWire>): StructFields {
  return Object.fromEntries(
    Object.entries(fields).map(([name, f]) => [
      name,
      f.type === 'object' ? { kind: 'object' as const, fields: f.nested ? toStructFields(f.nested) : null } : f.type,
    ]),
  )
}
const topLevelStructFields = computed<StructFields>(() => (configSchema.value ? toStructFields(configSchema.value.fields) : {}))

const configAppliedStateValue = ref<ConfigAppliedStateWire | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    configAppliedStateValue.value = undefined

    const version = mod?.interfaces['IStructuredConfig']?.version
    if (!mod || version === undefined) return

    const { value, unsubscribe } = subscribeState(mod.jid, 'IStructuredConfig', version)
    const stopWatch = watch(value, (v) => (configAppliedStateValue.value = v as ConfigAppliedStateWire | undefined), { immediate: true })
    stopSubscription = () => {
      stopWatch()
      unsubscribe()
    }
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

// Seeded once, from the module's current applied config (falling back to the
// schema's own default) — not re-synced on every push, this app's own
// established precedent over clobbering an in-progress edit.
const paramValues = ref<Record<string, string>>({})
const seeded = ref(false)

function seedFieldValue(leaf: LeafField, wireType: WireType): string {
  const current = getAtPath(configAppliedStateValue.value?.config, leaf.path)
  const raw = current !== undefined ? current : leaf.f.default
  if (raw === null || raw === undefined) {
    const base = defaultParamValue(wireType)
    return base !== '' ? base : (leaf.f.options?.[0] ?? '')
  }
  return typeof raw === 'boolean' ? String(raw) : String(raw)
}

watch(
  [configAppliedStateValue, leafFields],
  ([state, leaves]) => {
    if (seeded.value || !state || leaves.length === 0) return
    paramValues.value = Object.fromEntries(leaves.map((leaf) => [leaf.path, seedFieldValue(leaf, wireTypeFor(leaf.path, leaf.f))]))
    seeded.value = true
  },
  { immediate: true },
)

const applying = ref(false)
const error = ref('')
const applied = ref(false)

async function apply() {
  const mod = currentModule.value
  if (!mod || !configSchema.value) return

  applying.value = true
  error.value = ''
  applied.value = false
  try {
    // Deep clone, not a shallow spread: leaf writes below mutate nested
    // objects in place (setAtPath), and a shallow copy would still share
    // those nested objects with configAppliedStateValue's own state.
    // structuredClone() rejects this directly — it's a Vue reactive Proxy,
    // and the clone algorithm chokes on that even though every actual value
    // underneath is plain JSON-safe data (str/int/float/bool/dict) — so a
    // JSON round-trip both unwraps the proxy and clones in one step.
    const merged = JSON.parse(JSON.stringify(configAppliedStateValue.value?.config ?? {})) as Record<string, unknown>
    for (const leaf of leafFields.value) {
      setAtPath(merged, leaf.path, paramValueFromString(paramValues.value[leaf.path], wireTypeFor(leaf.path, leaf.f)))
    }
    const contentEl = structValueToXml(merged, topLevelStructFields.value)
    const result = await executeMethodRaw(mod.fullJid, 'set_config', [contentEl])
    if (result.success) {
      applied.value = true
    } else {
      error.value = `${result.errorClass ? `${result.errorClass}: ` : ''}${String(result.value)}`
    }
  } catch (e) {
    error.value = String(e)
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <div v-if="leafFields.length === 0" class="text-muted" style="font-size:0.85rem">
      No editable config fields.
    </div>

    <template v-else>
      <div class="form-check form-switch">
        <input id="config-show-expert" v-model="showExpert" class="form-check-input" type="checkbox" />
        <label class="form-check-label text-muted" style="font-size:0.8rem" for="config-show-expert">Show advanced fields</label>
      </div>
      <StructConfigForm v-model="paramValues" :fields="configSchema!.fields" :show-expert="showExpert" testid="structured-config" />
    </template>

    <div v-if="unsupportedFieldPaths.length > 0" class="text-muted" style="font-size:0.75rem">
      Not yet editable here: {{ unsupportedFieldPaths.join(', ') }}.
    </div>

    <button
      type="button"
      class="btn btn-primary btn-sm"
      :disabled="applying || !permitted('set_config')"
      :title="permitted('set_config') ? undefined : NOT_PERMITTED_TITLE"
      @click="apply"
    >
      <span v-if="applying" class="spinner-border spinner-border-sm me-1" role="status"></span>
      Apply
    </button>

    <div v-if="applied" class="text-success" style="font-size:0.8rem">Applied.</div>
    <div v-if="error" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">{{ error }}</div>
  </div>
</template>
