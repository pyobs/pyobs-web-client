<script setup lang="ts">
import { useXmpp } from '@/composables/useXmpp'

const { modules } = useXmpp()
</script>

<template>
  <div>
    <h5 class="text-light fw-semibold mb-4">Dashboard</h5>

    <div v-if="modules.length === 0" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      No modules discovered yet.
    </div>

    <div v-else class="row g-3">
      <div v-for="mod in modules" :key="mod" class="col-sm-6 col-lg-4">
        <div
          class="rounded-3 p-3 d-flex align-items-center gap-3"
          style="background-color:#1a1d21; border:1px solid #2d3035"
        >
          <span class="status-dot unknown"></span>
          <span class="text-light" style="font-size:0.9rem">{{ mod }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
