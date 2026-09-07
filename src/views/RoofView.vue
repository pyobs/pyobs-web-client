<script setup lang="ts">
import { ref, computed, type DeepReadonly } from 'vue'
import { useXmpp, type PyobsModule } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import ModuleStateCard from '@/components/ModuleStateCard.vue'

// One tab on ModulePageView.vue now, not its own routed page — jid is already
// resolved and guaranteed to implement IRoof (see moduleWidgets.ts) and be
// online (ModulePageView's own guard) by the time this renders. See
// specs/plans/module-page-rework.md.
const props = defineProps<{ jid: string }>()
const { modules, executeMethod } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

type Action = 'init' | 'park' | 'stop_motion'

function permitted(action: Action): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, action)
}

const running = ref<Record<string, Action>>({}) // jid -> action currently in flight
const errors = ref<Record<string, string>>({}) // jid -> last command's error, if any

async function run(mod: DeepReadonly<PyobsModule>, action: Action) {
  const schema = mod.interfaces['IRoof']?.commands[action] as CommandSchema | undefined
  if (!schema) return

  running.value = { ...running.value, [mod.jid]: action }
  errors.value = { ...errors.value, [mod.jid]: '' }
  try {
    // init/park take no params; stop_motion's one param (device) is optional
    // (stop everything) — every real IRoof command param is optional, so a
    // fixed `null` per declared param is always a valid call.
    const result = await executeMethod(mod.fullJid, action, schema.params.map(() => null), schema)
    if (!result.success) {
      errors.value = {
        ...errors.value,
        [mod.jid]: `${result.errorClass ? `${result.errorClass}: ` : ''}${String(result.value)}`,
      }
    }
  } catch (e) {
    errors.value = { ...errors.value, [mod.jid]: String(e) }
  } finally {
    const next = { ...running.value }
    delete next[mod.jid]
    running.value = next
  }
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <ModuleStateCard
      v-if="currentModule.interfaces['IMotion']"
      :jid="currentModule.jid"
      interface-name="IMotion"
      :version="currentModule.interfaces['IMotion'].version"
      title="Status"
    />

    <div class="d-flex flex-wrap gap-2 mt-2">
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!!running[currentModule.jid] || !permitted('init')"
        :title="permitted('init') ? undefined : NOT_PERMITTED_TITLE"
        @click="run(currentModule, 'init')"
      >
        <span v-if="running[currentModule.jid] === 'init'" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Open
      </button>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!!running[currentModule.jid] || !permitted('park')"
        :title="permitted('park') ? undefined : NOT_PERMITTED_TITLE"
        @click="run(currentModule, 'park')"
      >
        <span v-if="running[currentModule.jid] === 'park'" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Close
      </button>
      <button
        type="button"
        class="btn btn-outline-danger btn-sm"
        :disabled="!!running[currentModule.jid] || !permitted('stop_motion')"
        :title="permitted('stop_motion') ? undefined : NOT_PERMITTED_TITLE"
        @click="run(currentModule, 'stop_motion')"
      >
        <span v-if="running[currentModule.jid] === 'stop_motion'" class="spinner-border spinner-border-sm me-1" role="status"></span>
        Stop
      </button>
    </div>

    <div v-if="errors[currentModule.jid]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
      {{ errors[currentModule.jid] }}
    </div>
  </div>
</template>
