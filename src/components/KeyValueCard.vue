<script setup lang="ts">
defineProps<{ title: string; value: unknown }>()

function entries(val: unknown): Array<[string, unknown]> {
  if (val && typeof val === 'object' && !Array.isArray(val)) return Object.entries(val as Record<string, unknown>)
  return [['value', val]]
}

function formatEntry(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'object') {
    const inline = JSON.stringify(val)
    return inline.length <= 60 ? inline : JSON.stringify(val, null, 2)
  }
  return String(val)
}
</script>

<template>
  <div class="rounded-3 p-2 mb-2" style="background-color:#15181c; border:1px solid #2d3035">
    <div class="text-muted mb-1" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.03em">{{ title }}</div>
    <div v-for="[key, val] in entries(value)" :key="key" class="d-flex justify-content-between gap-2" style="font-size:0.8rem">
      <span class="text-secondary text-truncate">{{ key }}</span>
      <span class="text-light text-truncate" style="max-width: 60%">{{ formatEntry(val) }}</span>
    </div>
  </div>
</template>
