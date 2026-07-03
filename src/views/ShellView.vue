<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema, WireType } from '@/pyobs-codec'

const { modules, executeMethod } = useXmpp()

const selectedJid = ref('')
const selectedMethodKey = ref('') // `${ifaceName}::${methodName}` — command names aren't unique across interfaces
const paramValues = ref<Record<string, string>>({})
const running = ref(false)

type LogEntry = {
  id: number
  timestamp: number
  moduleName: string
  iface: string
  method: string
  paramsDisplay: string
  success: boolean
  value: unknown
  errorClass?: string
}

const log = ref<LogEntry[]>([])
const logContainer = ref<HTMLElement | null>(null)
let nextLogId = 0

const selectedModule = computed(() => modules.value.find((m) => m.jid === selectedJid.value))

// Every interface this module actually implements, with the commands it
// actually publishes — sourced live from disco#info, nothing pre-generated.
const methodsByIface = computed((): Array<{ iface: string; methods: string[] }> => {
  if (!selectedModule.value) return []
  return Object.entries(selectedModule.value.interfaces)
    .map(([iface, schema]) => ({ iface, methods: Object.keys(schema.commands).sort() }))
    .filter((g) => g.methods.length > 0)
    .sort((a, b) => a.iface.localeCompare(b.iface))
})

const currentIfaceName = computed(() => selectedMethodKey.value.split('::')[0] ?? '')
const currentMethodName = computed(() => selectedMethodKey.value.split('::')[1] ?? '')

const currentCommandSchema = computed((): CommandSchema | null => {
  const iface = selectedModule.value?.interfaces[currentIfaceName.value]
  return (iface?.commands[currentMethodName.value] as CommandSchema | undefined) ?? null
})

const currentEnums = computed(
  (): Record<string, string[]> =>
    (selectedModule.value?.interfaces[currentIfaceName.value]?.enums as Record<string, string[]> | undefined) ?? {},
)

function unwrapOptional(type: WireType): { inner: WireType; optional: boolean } {
  return typeof type === 'object' && type.kind === 'optional' ? { inner: type.inner, optional: true } : { inner: type, optional: false }
}

type WidgetKind = 'bool' | 'number' | 'string' | 'enum' | 'unsupported'

function widgetKind(type: WireType): WidgetKind {
  if (type === 'bool') return 'bool'
  if (type === 'int32' || type === 'float64') return 'number'
  if (type === 'string' || type === 'datetime') return 'string'
  if (typeof type === 'object' && type.kind === 'enum') return 'enum'
  return 'unsupported' // array/struct/any — pyobs-core doesn't publish enough schema to build these
}

function enumOptions(type: WireType): string[] {
  const { inner } = unwrapOptional(type)
  return typeof inner === 'object' && inner.kind === 'enum' ? (currentEnums.value[inner.name] ?? []) : []
}

const hasUnsupportedParam = computed(() =>
  (currentCommandSchema.value?.params ?? []).some((p) => widgetKind(unwrapOptional(p.type).inner) === 'unsupported'),
)

function formatWireType(type: WireType): string {
  if (typeof type === 'string') return type
  if (type.kind === 'enum') return `enum(${type.name})`
  if (type.kind === 'struct') return `struct<${type.name}>`
  if (type.kind === 'array') return `array<${formatWireType(type.item)}>`
  return `optional<${formatWireType(type.inner)}>`
}

// A <select> whose bound value doesn't match any of its <option>s renders
// blank instead of showing the placeholder — seed every param with a value
// that actually matches one of its widget's options (bool has no empty
// option, so it needs 'true' rather than ''). Non-optional number params
// also need a real seeded value: an empty number input must never silently
// become nil for a non-optional int32/float64 param (pyobs-core rejects it,
// e.g. a "%d format: a real number is required, not NoneType" crash).
// Optional params of any kind default to '' regardless — that's the one
// value execute() maps to nil, which is the correct default for "unset".
function defaultParamValue(type: WireType): string {
  const { inner, optional } = unwrapOptional(type)
  if (optional) return ''
  const kind = widgetKind(inner)
  if (kind === 'bool') return 'true'
  if (kind === 'number') return '0'
  return ''
}

function selectModule(jid: string) {
  selectedJid.value = jid
}

function selectMethod(iface: string, name: string) {
  selectedMethodKey.value = `${iface}::${name}`
}

watch(selectedJid, () => {
  selectedMethodKey.value = ''
  paramValues.value = {}
})

watch(currentCommandSchema, (schema) => {
  paramValues.value = Object.fromEntries((schema?.params ?? []).map((p) => [p.name, defaultParamValue(p.type)]))
})

function formatParamForDisplay(value: unknown): string {
  if (value === null) return 'None'
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

function formatResult(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') {
    const inline = JSON.stringify(value)
    return inline.length <= 80 ? inline : JSON.stringify(value, null, 2)
  }
  return String(value)
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function scrollLogToBottom() {
  nextTick(() => {
    if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight
  })
}

async function execute() {
  const module = selectedModule.value
  const schema = currentCommandSchema.value
  if (!module || !schema) return

  const iface = currentIfaceName.value
  const method = currentMethodName.value

  const params = schema.params.map((p) => {
    const { inner, optional } = unwrapOptional(p.type)
    const raw = paramValues.value[p.name]
    if (optional && (raw === undefined || raw === '')) return null
    const kind = widgetKind(inner)
    if (kind === 'bool') return raw === 'true'
    // Optional + empty was already handled above and returned null; a
    // non-optional number must always resolve to a real number, never nil.
    if (kind === 'number') return Number(raw || 0)
    return raw ?? ''
  })

  const paramsDisplay = schema.params.map((p, i) => `${p.name}=${formatParamForDisplay(params[i])}`).join(', ')

  running.value = true
  try {
    const result = await executeMethod(module.fullJid, method, params, schema)
    log.value.push({
      id: nextLogId++,
      timestamp: Date.now(),
      moduleName: module.name,
      iface,
      method,
      paramsDisplay,
      success: result.success,
      value: result.value,
      errorClass: result.errorClass,
    })
  } catch (e) {
    log.value.push({
      id: nextLogId++,
      timestamp: Date.now(),
      moduleName: module.name,
      iface,
      method,
      paramsDisplay,
      success: false,
      value: String(e),
    })
  } finally {
    running.value = false
    scrollLogToBottom()
  }
}
</script>

<template>
  <div class="d-flex flex-column" style="height: calc(100vh - 6rem)">
    <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
      <h5 class="text-light fw-semibold mb-0">Shell</h5>
      <button class="btn btn-outline-secondary btn-sm ms-auto" @click="log = []">
        <i class="bi bi-trash me-1"></i>Clear
      </button>
    </div>

    <!-- Command / reply log -->
    <div
      ref="logContainer"
      data-testid="shell-log"
      class="flex-grow-1 overflow-auto rounded-3 p-2 mb-3"
      style="background-color: #111316; font-family: monospace; font-size: 0.8rem"
    >
      <p v-if="log.length === 0" class="text-muted text-center mt-4" style="font-size:0.85rem">
        No commands executed yet.
      </p>

      <div v-for="entry in log" :key="entry.id" class="mb-2 pb-2 border-bottom border-secondary-subtle">
        <div class="text-secondary">
          <span class="me-2">{{ formatTime(entry.timestamp) }}</span>
          <span class="text-info">{{ entry.moduleName }}</span>:
          <span class="text-light">{{ entry.iface }}.{{ entry.method }}</span>(<span class="text-muted">{{ entry.paramsDisplay }}</span>)
        </div>
        <div :class="entry.success ? 'text-success' : 'text-danger'" style="white-space:pre-wrap">
          <template v-if="entry.success">{{ formatResult(entry.value) }}</template>
          <template v-else>{{ entry.errorClass ? `${entry.errorClass}: ` : '' }}{{ formatResult(entry.value) }}</template>
        </div>
      </div>
    </div>

    <!-- Command builder: module -> method -> params, buttons over dropdowns for mobile -->
    <div class="flex-shrink-0">
      <div class="mb-2">
        <div class="text-muted mb-1 text-uppercase" style="font-size:0.65rem; letter-spacing:.06em">Module</div>
        <div class="d-flex flex-wrap gap-2" data-testid="shell-modules">
          <button
            v-for="m in modules"
            :key="m.jid"
            type="button"
            class="btn btn-sm"
            :class="selectedJid === m.jid ? 'btn-primary' : 'btn-outline-secondary'"
            @click="selectModule(m.jid)"
          >
            {{ m.name }}
          </button>
          <span v-if="modules.length === 0" class="text-muted align-self-center" style="font-size:0.8rem">No modules online.</span>
        </div>
      </div>

      <div v-if="selectedJid" class="mb-2">
        <div class="text-muted mb-1 text-uppercase" style="font-size:0.65rem; letter-spacing:.06em">Method</div>
        <div
          class="overflow-auto rounded-3 p-2"
          style="max-height: 25vh; background-color: #16181b; border: 1px solid #2d3035"
          data-testid="shell-methods"
        >
          <p v-if="methodsByIface.length === 0" class="text-muted mb-0" style="font-size:0.8rem">
            This module publishes no commands.
          </p>
          <div v-for="g in methodsByIface" :key="g.iface" class="d-flex flex-wrap align-items-center gap-1 mb-1">
            <span class="text-secondary me-1" style="font-size:0.7rem; min-width:5rem">{{ g.iface }}</span>
            <button
              v-for="name in g.methods"
              :key="name"
              type="button"
              class="btn btn-sm"
              :class="selectedMethodKey === `${g.iface}::${name}` ? 'btn-primary' : 'btn-outline-secondary'"
              @click="selectMethod(g.iface, name)"
            >
              {{ name }}
            </button>
          </div>
        </div>
      </div>

      <template v-if="currentCommandSchema">
        <div v-if="currentCommandSchema.params.length" class="mb-2" data-testid="shell-params">
          <div v-for="param in currentCommandSchema.params" :key="param.name" class="mb-2">
            <div class="d-flex align-items-baseline gap-2 mb-1">
              <label class="form-label mb-0 text-muted" style="font-size:0.8rem">
                {{ param.name }}
                <span v-if="unwrapOptional(param.type).optional" class="text-secondary" style="font-size:0.7rem">(optional)</span>
              </label>
              <span class="text-secondary" style="font-size:0.7rem">
                {{ formatWireType(param.type) }}
                <span v-if="param.unit">({{ param.unit }})</span>
              </span>
            </div>
            <select
              v-if="widgetKind(unwrapOptional(param.type).inner) === 'bool'"
              v-model="paramValues[param.name]"
              class="form-select form-select-sm bg-dark border-secondary text-light"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
            <select
              v-else-if="widgetKind(unwrapOptional(param.type).inner) === 'enum'"
              v-model="paramValues[param.name]"
              class="form-select form-select-sm bg-dark border-secondary text-light"
            >
              <option value="">—</option>
              <option v-for="opt in enumOptions(param.type)" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <input
              v-else-if="widgetKind(unwrapOptional(param.type).inner) !== 'unsupported'"
              v-model="paramValues[param.name]"
              :type="widgetKind(unwrapOptional(param.type).inner) === 'number' ? 'number' : 'text'"
              class="form-control form-control-sm bg-dark border-secondary text-light"
            />
            <span v-else class="text-danger" style="font-size:0.75rem">unsupported param type</span>
          </div>
        </div>
        <p v-else class="text-muted mb-2" style="font-size:0.85rem">No parameters.</p>

        <button
          class="btn btn-primary btn-sm"
          :disabled="running || hasUnsupportedParam"
          @click="execute"
        >
          <span v-if="running">
            <span class="spinner-border spinner-border-sm me-1" role="status"></span>
            Running…
          </span>
          <span v-else>
            <i class="bi bi-play-fill me-1"></i>
            Execute
          </span>
        </button>
      </template>
    </div>
  </div>
</template>
