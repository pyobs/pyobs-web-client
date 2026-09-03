<script setup lang="ts">
import { ref, computed, onUnmounted, type DeepReadonly } from 'vue'
import { useXmpp, type PyobsModule } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import ModuleStateCard from '@/components/ModuleStateCard.vue'

const props = defineProps<{ mod: DeepReadonly<PyobsModule> }>()

const { executeMethod, subscribeState } = useXmpp()

const iface = props.mod.interfaces['IMode']
const { value: stateValue, unsubscribe } = subscribeState(props.mod.jid, 'IMode', iface!.version)
onUnmounted(unsubscribe)

const settingGroup = ref<Record<string, boolean>>({}) // group -> in flight
const errors = ref<Record<string, string>>({}) // group -> last error, if any

const availableModes = computed<Record<string, string[]>>(() => {
  const capabilities = props.mod.capabilities['IMode'] as Record<string, unknown> | undefined
  if (!capabilities || typeof capabilities !== 'object' || !('modes' in capabilities)) return {}

  const modes = capabilities.modes
  if (typeof modes !== 'object' || modes === null) return {}
  return modes as Record<string, string[]>
})

function currentMode(group: string): string | undefined {
  const state = stateValue.value
  if (!state || typeof state !== 'object' || !('modes' in state)) return undefined

  const modes = state.modes
  if (typeof modes !== 'object' || modes === null) return undefined
  return (modes as Record<string, string>)[group]
}

async function setMode(group: string, mode: string) {
  const schema = iface?.commands['set_mode'] as CommandSchema | undefined
  if (!schema) return

  settingGroup.value = { ...settingGroup.value, [group]: true }
  errors.value = { ...errors.value, [group]: '' }
  try {
    const result = await executeMethod(props.mod.fullJid, 'set_mode', [mode, group], schema)
    if (!result.success) {
      errors.value = {
        ...errors.value,
        [group]: `${result.errorClass ? `${result.errorClass}: ` : ''}${String(result.value)}`,
      }
    }
  } catch (e) {
    errors.value = { ...errors.value, [group]: String(e) }
  } finally {
    const next = { ...settingGroup.value }
    delete next[group]
    settingGroup.value = next
  }
}
</script>

<template>
  <div class="rounded-3 p-3 pyobs-panel">
    <div class="d-flex align-items-center gap-2 mb-2">
      <span class="status-dot online flex-shrink-0"></span>
      <span class="text-body fw-semibold" style="font-size:0.9rem">{{ mod.name }}</span>
      <span class="text-muted" style="font-size:0.75rem">{{ mod.jid }}</span>
    </div>

    <ModuleStateCard v-if="iface" :jid="mod.jid" interface-name="IMode" :version="iface.version" title="Status" />

    <div class="d-flex flex-column gap-2 mt-2">
      <template v-for="(modes, group) in availableModes" :key="String(group)">
        <div v-if="modes && modes.length > 0" class="d-flex align-items-center gap-2">
          <span class="text-body" style="font-size:0.85rem; min-width:120px">{{ group || 'default' }}</span>
          <select
            class="form-select form-select-sm"
            style="max-width:200px"
            :value="currentMode(String(group))"
            :disabled="settingGroup[String(group)]"
            @change="setMode(String(group), ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="mode in modes" :key="mode" :value="mode">{{ mode }}</option>
          </select>
          <span v-if="settingGroup[String(group)]" class="spinner-border spinner-border-sm text-muted" role="status"></span>
        </div>
        <div v-if="errors[String(group)]" class="alert alert-danger py-1 px-2 mb-0" style="font-size:0.8rem">
          {{ errors[String(group)] }}
        </div>
      </template>
    </div>

    <div v-if="Object.keys(availableModes).length === 0" class="text-muted mt-2" style="font-size:0.8rem">
      No mode groups configured.
    </div>
  </div>
</template>
