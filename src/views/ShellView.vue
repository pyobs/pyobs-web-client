<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import { PYOBS_INTERFACES } from '@/pyobs-interfaces'

const { modules, executeMethod } = useXmpp()

const selectedJid = ref('')
const selectedMethod = ref('')
const paramValues = ref<Record<string, string>>({})
const result = ref<{ success: boolean; value: unknown } | null>(null)
const running = ref(false)

const selectedModule = computed(() => modules.value.find((m) => m.jid === selectedJid.value))

// Extract interface name from a pyobs feature string.
// pyobs announces features as "pyobs:IFoo" or "urn:pyobs:IFoo".
function ifaceNameFromFeature(feat: string): string | null {
  if (feat.startsWith('pyobs:interface:')) return feat.slice(16)
  return null
}

// Collect all methods from every pyobs interface the selected module announces,
// grouped by interface name for the <optgroup> display.
const methodsByIface = computed((): Array<{ iface: string; methods: string[] }> => {
  if (!selectedModule.value) return []
  const groups: Array<{ iface: string; methods: string[] }> = []
  for (const feat of selectedModule.value.features) {
    const ifaceName = ifaceNameFromFeature(feat)
    if (!ifaceName) continue
    const iface = PYOBS_INTERFACES[ifaceName]
    if (!iface) continue
    const names = Object.keys(iface.methods)
    if (names.length) groups.push({ iface: ifaceName, methods: names.sort() })
  }
  return groups
})

const currentMethodDef = computed(() => {
  if (!selectedMethod.value) return null
  for (const feat of selectedModule.value?.features ?? []) {
    const ifaceName = ifaceNameFromFeature(feat)
    if (!ifaceName) continue
    const def = PYOBS_INTERFACES[ifaceName]?.methods[selectedMethod.value]
    if (def) return def
  }
  return null
})

watch(selectedJid, () => {
  selectedMethod.value = ''
  paramValues.value = {}
  result.value = null
})

watch(selectedMethod, () => {
  paramValues.value = {}
  result.value = null
})

async function execute() {
  if (!selectedModule.value || !selectedMethod.value || !currentMethodDef.value) return
  running.value = true
  result.value = null
  try {
    const params = currentMethodDef.value.params
      .filter((p) => !p.optional || paramValues.value[p.name] !== undefined)
      .map((p) => ({ type: p.type, value: paramValues.value[p.name] ?? '' }))

    result.value = await executeMethod(selectedModule.value.fullJid, selectedMethod.value, params)
  } catch (e) {
    result.value = { success: false, value: String(e) }
  } finally {
    running.value = false
  }
}

function formatResult(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') {
    const inline = JSON.stringify(value)
    return inline.length <= 80 ? inline : JSON.stringify(value, null, 2)
  }
  return String(value)
}
</script>

<template>
  <div>
    <h5 class="text-light fw-semibold mb-4">Shell</h5>

    <!-- Module + method selectors -->
    <div class="row g-3 mb-4">
      <div class="col-sm-5">
        <label class="form-label text-muted" style="font-size:0.8rem">Module</label>
        <select
          v-model="selectedJid"
          class="form-select form-select-sm bg-dark border-secondary text-light"
        >
          <option value="">— select module —</option>
          <option v-for="m in modules" :key="m.jid" :value="m.jid">{{ m.name }}</option>
        </select>
      </div>

      <div class="col-sm-7">
        <label class="form-label text-muted" style="font-size:0.8rem">Method</label>
        <select
          v-model="selectedMethod"
          class="form-select form-select-sm bg-dark border-secondary text-light"
          :disabled="!selectedJid || methodsByIface.length === 0"
        >
          <option value="">— select method —</option>
          <optgroup v-for="g in methodsByIface" :key="g.iface" :label="g.iface">
            <option v-for="name in g.methods" :key="name" :value="name">{{ name }}</option>
          </optgroup>
        </select>
      </div>
    </div>

    <!-- Method doc + parameter form -->
    <template v-if="currentMethodDef">
      <p v-if="currentMethodDef.doc" class="text-muted mb-3" style="font-size:0.85rem">
        {{ currentMethodDef.doc }}
      </p>

      <div v-if="currentMethodDef.params.length" class="mb-3">
        <div
          v-for="param in currentMethodDef.params"
          :key="param.name"
          class="row align-items-center g-2 mb-2"
        >
          <div class="col-sm-3 text-end">
            <label class="form-label mb-0 text-muted" style="font-size:0.8rem">
              {{ param.name }}
              <span v-if="param.optional" class="text-secondary ms-1" style="font-size:0.7rem">(optional)</span>
            </label>
          </div>
          <div class="col-sm-6">
            <select
              v-if="param.type === 'boolean'"
              v-model="paramValues[param.name]"
              class="form-select form-select-sm bg-dark border-secondary text-light"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
            <input
              v-else
              v-model="paramValues[param.name]"
              :type="param.type === 'number' ? 'number' : 'text'"
              class="form-control form-control-sm bg-dark border-secondary text-light"
              :placeholder="param.type"
            />
          </div>
          <div class="col-sm-3">
            <span class="text-secondary" style="font-size:0.75rem">{{ param.type }}</span>
          </div>
        </div>
      </div>
      <p v-else class="text-muted mb-3" style="font-size:0.85rem">No parameters.</p>

      <button
        class="btn btn-primary btn-sm"
        :disabled="running"
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

    <!-- Result -->
    <div v-if="result !== null" class="mt-4">
      <div
        class="rounded-3 p-3"
        :class="result.success ? 'border-success' : 'border-danger'"
        style="background-color:#1a1d21; border-width:1px; border-style:solid"
      >
        <div class="mb-1" style="font-size:0.75rem" :class="result.success ? 'text-success' : 'text-danger'">
          {{ result.success ? 'Result' : 'Error' }}
        </div>
        <pre class="mb-0 text-light" style="font-size:0.85rem; white-space:pre-wrap">{{ formatResult(result.value) }}</pre>
      </div>
    </div>
  </div>
</template>
