<script setup lang="ts">
// IStructuredConfig — see pyobs_gui/structuredconfigwidget.py and
// specs/plans/2026-09-07-structured-config-widget.md. Phase 1 only: flat
// (non-nested) ConfigSchema fields, reusing ParamForm.vue's field-type
// rendering, staged and applied with a single set_config call. Nested
// object-type fields (Phase 2) and the basic/expert AccessLevel toggle plus
// per-field descriptions (Phase 3) are deferred — no fixture exists yet to
// verify the nested case against, per the plan.
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
  defaultParamValue,
  enumOptions,
  paramValueFromString,
  structValueToXml,
  type FieldSchema,
  type StructFields,
  type WireType,
} from '@/pyobs-codec'
import ParamForm from '@/components/ParamForm.vue'

type ConfigFieldSchemaWire = {
  type: 'str' | 'int' | 'float' | 'bool' | 'enum' | 'object'
  unit: string | null
  options: string[] | null
  default: unknown
  nested: Record<string, ConfigFieldSchemaWire> | null
}
type ConfigSchemaWire = { fields: Record<string, ConfigFieldSchemaWire> }
type ConfigAppliedState = { config: Record<string, unknown> }

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

const flatFields = computed(() => Object.entries(configSchema.value?.fields ?? {}).filter(([, f]) => f.type !== 'object'))
const nestedFieldNames = computed(() =>
  Object.entries(configSchema.value?.fields ?? {})
    .filter(([, f]) => f.type === 'object')
    .map(([name]) => name),
)

function wireTypeFor(name: string, f: ConfigFieldSchemaWire): WireType {
  return f.type === 'enum' ? { kind: 'enum', name } : SCALAR_TYPE_MAP[f.type as 'str' | 'int' | 'float' | 'bool']
}

const paramFieldSchemas = computed<FieldSchema[]>(() =>
  flatFields.value.map(([name, f]) => ({ name, type: wireTypeFor(name, f), unit: f.unit ?? undefined })),
)
const paramEnums = computed<Record<string, string[]>>(() =>
  Object.fromEntries(flatFields.value.filter(([, f]) => f.type === 'enum').map(([name, f]) => [name, f.options ?? []])),
)

function toStructFields(fields: Record<string, ConfigFieldSchemaWire>): StructFields {
  return Object.fromEntries(
    Object.entries(fields).map(([name, f]) => [
      name,
      f.type === 'object' ? { kind: 'object' as const, fields: f.nested ? toStructFields(f.nested) : null } : f.type,
    ]),
  )
}
const topLevelStructFields = computed<StructFields>(() => (configSchema.value ? toStructFields(configSchema.value.fields) : {}))

const configAppliedStateValue = ref<ConfigAppliedState | undefined>(undefined)
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
    const stopWatch = watch(value, (v) => (configAppliedStateValue.value = v as ConfigAppliedState | undefined), { immediate: true })
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

function seedFieldValue(name: string, f: ConfigFieldSchemaWire, wireType: WireType): string {
  const current = configAppliedStateValue.value?.config[name]
  const raw = current !== undefined ? current : f.default
  if (raw === null || raw === undefined) {
    const base = defaultParamValue(wireType)
    return base !== '' ? base : (enumOptions(wireType, paramEnums.value)[0] ?? '')
  }
  return typeof raw === 'boolean' ? String(raw) : String(raw)
}

watch(
  [configAppliedStateValue, flatFields],
  ([state, fields]) => {
    if (seeded.value || !state || fields.length === 0) return
    paramValues.value = Object.fromEntries(fields.map(([name, f]) => [name, seedFieldValue(name, f, wireTypeFor(name, f))]))
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
    const merged: Record<string, unknown> = { ...(configAppliedStateValue.value?.config ?? {}) }
    for (const [name, f] of flatFields.value) {
      merged[name] = paramValueFromString(paramValues.value[name], wireTypeFor(name, f))
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
    <div v-if="paramFieldSchemas.length === 0" class="text-muted" style="font-size:0.85rem">
      No editable config fields.
    </div>

    <ParamForm v-else v-model="paramValues" :fields="paramFieldSchemas" :enums="paramEnums" testid="structured-config" />

    <div v-if="nestedFieldNames.length > 0" class="text-muted" style="font-size:0.75rem">
      Not yet editable here: {{ nestedFieldNames.join(', ') }}.
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
