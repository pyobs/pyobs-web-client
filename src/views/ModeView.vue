<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useXmpp } from '@/composables/useXmpp'
import ModeModuleCard from '@/components/ModeModuleCard.vue'

const route = useRoute()
const router = useRouter()
const { modules } = useXmpp()

const modeModules = computed(() =>
  modules.value.filter((m) => 'IMode' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)

const routeJid = computed(() => route.params.jid as string | undefined)

const currentModule = computed(() =>
  routeJid.value ? modeModules.value.find((m) => m.jid === routeJid.value) : undefined,
)

// No :jid in the URL: redirect to the first online module (alphabetical), so
// the single-instance case stays a one-click nav hit with no picker step. If
// a module goes offline while its page is open, we stay put and fall through
// to the "not online" empty state below instead of forcing a navigation.
watchEffect(() => {
  if (!routeJid.value && modeModules.value.length > 0) {
    router.replace({ name: 'mode', params: { jid: modeModules.value[0]!.jid } })
  }
})
</script>

<template>
  <div style="max-width: 800px">
    <h5 class="text-body fw-semibold mb-4">Mode</h5>

    <div v-if="modeModules.length === 0" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      No IMode modules online.
    </div>

    <div v-else-if="!currentModule" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      Mode module{{ routeJid ? ` "${routeJid}"` : '' }} is not online.
    </div>

    <div v-else class="d-flex flex-column gap-2">
      <ModeModuleCard :key="currentModule.jid" :mod="currentModule" />
    </div>
  </div>
</template>
