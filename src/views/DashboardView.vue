<script setup lang="ts">
import { useXmpp } from '@/composables/useXmpp'
import ModuleStateCard from '@/components/ModuleStateCard.vue'
import KeyValueCard from '@/components/KeyValueCard.vue'

const { modules } = useXmpp()
</script>

<template>
  <div>
    <h5 class="text-light fw-semibold mb-4">Dashboard</h5>

    <div v-if="modules.length === 0" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      No pyobs modules online.
    </div>

    <div v-else class="row g-3">
      <div v-for="mod in modules" :key="mod.jid" class="col-sm-6 col-lg-4">
        <div
          class="rounded-3 p-3"
          style="background-color:#1a1d21; border:1px solid #2d3035"
        >
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="status-dot online"></span>
            <span class="text-light fw-semibold" style="font-size:0.9rem">{{ mod.name }}</span>
          </div>
          <div class="text-muted mb-2" style="font-size:0.75rem">{{ mod.jid }}</div>

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
