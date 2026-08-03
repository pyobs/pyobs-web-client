<script setup lang="ts">
import { computed } from 'vue'
import { useXmpp } from '@/composables/useXmpp'

const { events } = useXmpp()

const nonLogEvents = computed(() => events.value.filter((e) => e.type !== 'LogEvent'))

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}
</script>

<template>
  <div class="d-flex flex-column" style="height: calc(100vh - 6rem)">
    <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
      <h5 class="text-light fw-semibold mb-0">Events</h5>
    </div>

    <div
      class="flex-grow-1 overflow-auto rounded-3 p-2"
      style="background-color: #111316; font-family: monospace; font-size: 0.8rem"
    >
      <p v-if="nonLogEvents.length === 0" class="text-muted text-center mt-4" style="font-size:0.85rem">
        No events yet.
      </p>

      <table v-else class="w-100" style="table-layout: fixed">
        <tbody>
          <tr v-for="ev in nonLogEvents" :key="ev.uuid">
            <td class="text-secondary pe-3 text-nowrap align-top" style="width: 5.5rem">{{ formatTime(ev.timestamp) }}</td>
            <td class="pe-3 text-muted align-top text-truncate" style="width: 8rem">{{ ev.module }}</td>
            <td class="pe-3 text-light align-top text-truncate" style="width: 10rem; min-width: 0">{{ ev.type }}</td>
            <td class="text-break align-top text-muted" style="white-space: pre-wrap">{{ JSON.stringify(ev.data, null, 2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
