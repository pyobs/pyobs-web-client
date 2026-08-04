<script setup lang="ts">
import { ref, computed, watchEffect, type DeepReadonly } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useXmpp, type PyobsModule } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'
import ModuleStateCard from '@/components/ModuleStateCard.vue'

const route = useRoute()
const router = useRouter()
const { modules, executeMethod } = useXmpp()

const roofModules = computed(() =>
  modules.value.filter((m) => 'IRoof' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)

const routeJid = computed(() => route.params.jid as string | undefined)

const currentModule = computed(() =>
  routeJid.value ? roofModules.value.find((m) => m.jid === routeJid.value) : undefined,
)

// No :jid in the URL: redirect to the first online module (alphabetical), so
// the single-instance case stays a one-click nav hit with no picker step. If
// a module goes offline while its page is open, we stay put and fall through
// to the "not online" empty state below instead of forcing a navigation.
watchEffect(() => {
  if (!routeJid.value && roofModules.value.length > 0) {
    router.replace({ name: 'roof', params: { jid: roofModules.value[0]!.jid } })
  }
})

type Action = 'init' | 'park' | 'stop_motion'

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
  <div style="max-width: 800px">
    <h5 class="text-light fw-semibold mb-4">Roof</h5>

    <div v-if="roofModules.length === 0" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      No IRoof modules online.
    </div>

    <div v-else-if="!currentModule" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      Roof module{{ routeJid ? ` "${routeJid}"` : '' }} is not online.
    </div>

    <div v-else class="d-flex flex-column gap-2">
      <div
        :key="currentModule.jid"
        class="rounded-3 p-3"
        style="background-color:#1a1d21; border:1px solid #2d3035"
      >
        <div class="d-flex align-items-center gap-2 mb-2">
          <span class="status-dot online flex-shrink-0"></span>
          <span class="text-light fw-semibold" style="font-size:0.9rem">{{ currentModule.name }}</span>
          <span class="text-muted" style="font-size:0.75rem">{{ currentModule.jid }}</span>
        </div>

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
            :disabled="!!running[currentModule.jid]"
            @click="run(currentModule, 'init')"
          >
            <span v-if="running[currentModule.jid] === 'init'" class="spinner-border spinner-border-sm me-1" role="status"></span>
            Open
          </button>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="!!running[currentModule.jid]"
            @click="run(currentModule, 'park')"
          >
            <span v-if="running[currentModule.jid] === 'park'" class="spinner-border spinner-border-sm me-1" role="status"></span>
            Close
          </button>
          <button
            type="button"
            class="btn btn-outline-danger btn-sm"
            :disabled="!!running[currentModule.jid]"
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
    </div>
  </div>
</template>
