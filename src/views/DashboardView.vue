<script setup lang="ts">
import { ref, computed } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import ModuleStateCard from '@/components/ModuleStateCard.vue'
import KeyValueCard from '@/components/KeyValueCard.vue'

const { modules } = useXmpp()

const sortedModules = computed(() => [...modules.value].sort((a, b) => a.name.localeCompare(b.name)))

// Ephemeral (in-memory only, not persisted across a reload) — which modules are
// expanded. Collapsed is the default for every module, so ModuleStateCard's
// mount-triggered PubSub subscriptions (ref-counted in useXmpp's subscribeState)
// only exist for rows actually being looked at — expanding/collapsing a row
// mounts/unmounts its ModuleStateCards, which subscribe/unsubscribe accordingly.
const expanded = ref<Set<string>>(new Set())

function toggleExpanded(jid: string) {
  const next = new Set(expanded.value)
  if (next.has(jid)) {
    next.delete(jid)
  } else {
    next.add(jid)
  }
  expanded.value = next
}

function expandAll() {
  expanded.value = new Set(sortedModules.value.map((mod) => mod.jid))
}

function collapseAll() {
  expanded.value = new Set()
}
</script>

<template>
  <div>
    <div class="d-flex align-items-center justify-content-between mb-4">
      <h5 class="text-light fw-semibold mb-0">Dashboard</h5>
      <div v-if="modules.length" class="d-flex gap-2">
        <button type="button" class="btn btn-outline-secondary btn-sm" @click="expandAll">Expand all</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" @click="collapseAll">Collapse all</button>
      </div>
    </div>

    <div v-if="modules.length === 0" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      No pyobs modules online.
    </div>

    <div v-else class="d-flex flex-column gap-2">
      <div
        v-for="mod in sortedModules"
        :key="mod.jid"
        class="rounded-3"
        style="background-color:#1a1d21; border:1px solid #2d3035"
      >
        <div
          class="d-flex align-items-center gap-2 p-3"
          style="cursor:pointer"
          @click="toggleExpanded(mod.jid)"
        >
          <span class="status-dot online flex-shrink-0"></span>
          <div class="flex-grow-1" style="min-width:0">
            <div class="text-light fw-semibold text-truncate" style="font-size:0.9rem">{{ mod.name }}</div>
            <div class="text-muted text-truncate" style="font-size:0.75rem">{{ mod.jid }}</div>
          </div>
          <i
            class="bi flex-shrink-0"
            :class="expanded.has(mod.jid) ? 'bi-chevron-down' : 'bi-chevron-right'"
            style="font-size:0.8rem"
          ></i>
        </div>

        <div v-if="expanded.has(mod.jid)" class="px-3 pb-3">
          <div v-if="Object.keys(mod.interfaces).length" class="d-flex flex-wrap gap-1 mb-2">
            <span
              v-for="iface in Object.values(mod.interfaces)"
              :key="iface.name"
              class="badge bg-secondary"
              style="font-size:0.65rem; font-weight:400"
            >{{ iface.name }}:{{ iface.version }}</span>
          </div>

          <ModuleStateCard
            v-for="iface in Object.values(mod.interfaces).filter((i) => i.state)"
            :key="`state-${mod.jid}-${iface.name}`"
            :jid="mod.jid"
            :interface-name="iface.name"
            :version="iface.version"
            :title="iface.name"
          />

          <KeyValueCard
            v-for="[ifaceName, caps] in Object.entries(mod.capabilities)"
            :key="`caps-${mod.jid}-${ifaceName}`"
            :title="`${ifaceName} capabilities`"
            :value="caps"
          />
        </div>
      </div>
    </div>
  </div>
</template>
