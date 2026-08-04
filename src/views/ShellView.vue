<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import { hasUnsupportedField, defaultParamValue, paramValueFromString } from '@/pyobs-codec'
import ParamForm from '@/components/ParamForm.vue'

const { modules, executeMethod } = useXmpp()

const selectedJid = ref('')
const selectedMethodKey = ref('') // `${ifaceName}::${methodName}` — command names aren't unique across interfaces
const paramValues = ref<Record<string, string>>({})
const running = ref(false)

// Only one of module/method/params is shown at a time — picking a value at one
// layer advances to the next; the completed layer collapses to a one-line,
// tappable summary instead of staying expanded alongside it.
type BuilderStep = 'module' | 'method' | 'params'
const step = ref<BuilderStep>('module')

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

const hasUnsupportedParam = computed(() => hasUnsupportedField(currentCommandSchema.value?.params ?? []))

function selectModule(jid: string) {
  selectedJid.value = jid
  step.value = 'method'
}

function selectMethod(iface: string, name: string) {
  selectedMethodKey.value = `${iface}::${name}`
  step.value = 'params'
}

function backToModuleStep() {
  step.value = 'module'
}

function backToMethodStep() {
  step.value = 'method'
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

  const params = schema.params.map((p) => paramValueFromString(paramValues.value[p.name], p.type))

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
    // Full reset back to the module picker, per the accordion design — not
    // just clearing params — so the builder always starts fresh after a run.
    selectedJid.value = ''
    selectedMethodKey.value = ''
    paramValues.value = {}
    step.value = 'module'
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

    <!-- Command builder: only one of module/method/params is shown at a time; a
         completed layer collapses into a tappable one-line summary. -->
    <div class="flex-shrink-0">
      <div class="mb-2">
        <template v-if="step === 'module'">
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
        </template>
        <button
          v-else
          type="button"
          class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
          data-testid="shell-module-summary"
          @click="backToModuleStep"
        >
          <span class="text-muted">Module:</span> {{ selectedModule?.name }}
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>

      <div v-if="selectedJid" class="mb-2">
        <template v-if="step === 'method'">
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
        </template>
        <button
          v-else-if="step === 'params'"
          type="button"
          class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
          data-testid="shell-method-summary"
          @click="backToMethodStep"
        >
          <span class="text-muted">Method:</span> {{ currentIfaceName }}.{{ currentMethodName }}
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>

      <template v-if="step === 'params' && currentCommandSchema">
        <ParamForm
          v-model="paramValues"
          :fields="currentCommandSchema.params"
          :enums="currentEnums"
          testid="shell-params"
        />

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
