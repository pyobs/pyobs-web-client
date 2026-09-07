<script setup lang="ts">
// Curated status display for a module widget's live state — the mockup's
// "Status / RA-Dec / Alt-Az" style rows, driven by fields the caller curates
// from raw subscribed state, not a dump of every field an interface happens
// to publish. Replaces KeyValueCard/ModuleStateCard as the primary status
// display in the 7 module widgets — see
// specs/plans/2026-09-07-widget-visual-redesign.md.
defineProps<{ title?: string; fields: { label: string; value: string }[] }>()
</script>

<template>
  <div class="pyobs-card">
    <div v-if="title" class="text-muted mb-1" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.03em">
      {{ title }}
    </div>
    <div v-for="field in fields" :key="field.label" class="d-flex justify-content-between gap-2" style="font-size:0.85rem">
      <span class="text-secondary text-truncate">{{ field.label }}</span>
      <span class="text-light" style="max-width:60%; overflow-wrap:break-word">{{ field.value }}</span>
    </div>
  </div>
</template>
