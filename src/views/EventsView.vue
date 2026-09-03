<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import type { EventSchema } from '@/pyobs-codec'
import { hasUnsupportedField, defaultParamValue, paramValueFromString } from '@/pyobs-codec'
import ParamForm from '@/components/ParamForm.vue'

const { events, modules, publishEvent } = useXmpp()

const nonLogEvents = computed(() => events.value.filter((e) => e.type !== 'LogEvent'))

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

// ── send-event tool: event type -> param form -> publish ───────────────────
// Deliberately NOT a module picker first: you're testing what happens when
// an event fires, e.g. sending BadWeatherEvent to see whether roof/telescope
// react safely — the module you'd want to watch react is usually one that
// only *subscribes* to the event, not one that emits it. So this flattens to
// a single event-type picker across the union of every currently-online
// module's own declared events, each labeled by role (send/subscribe, see
// ../pyobs-core/specs/plans/event-role-advertising.md) so it's clear which
// declaring module(s) are real sources versus just reactors — a module-
// scoped picker couldn't tell the difference before that landed. Publishing
// itself never needed a "which module" answer anyway — it's always
// self-published under your own JID (see
// specs/design/events-page-send-tool.md).

const showSender = ref(false)

type BuilderStep = 'event' | 'params'
const step = ref<BuilderStep>('event')

const selectedEventKey = ref('') // `${name}:${version}` — names alone aren't guaranteed unique
const paramValues = ref<Record<string, string>>({})
const sending = ref(false)
const sendResult = ref<{ success: boolean; message: string } | null>(null)

type EventOption = { schema: EventSchema; senders: string[]; subscribers: string[] }

// One entry per distinct (name, version), deduped across every module that
// currently declares it, split by role into who actually sends it vs. who
// only reacts to it — e.g. `weather` sends BadWeatherEvent, `camera` only
// subscribes to abort an exposure. `senders.length === 0` means no
// currently-online module actually emits this event for real — you'd be
// sending a synthetic one purely for testing subscribers (surfaced via
// roleHint()'s hover text, not a separate visual warning).
const eventOptions = computed((): EventOption[] => {
  const byKey = new Map<string, EventOption>()
  for (const m of modules.value) {
    for (const schema of Object.values(m.events) as EventSchema[]) {
      const key = `${schema.name}:${schema.version}`
      let entry = byKey.get(key)
      if (!entry) {
        entry = { schema, senders: [], subscribers: [] }
        byKey.set(key, entry)
      }
      if (schema.role.includes('send')) entry.senders.push(m.name)
      if (schema.role.includes('subscribe')) entry.subscribers.push(m.name)
    }
  }
  return [...byKey.values()].sort((a, b) => a.schema.name.localeCompare(b.schema.name))
})

function roleHint(opt: EventOption): string {
  const parts: string[] = []
  parts.push(opt.senders.length ? `Sent by: ${opt.senders.join(', ')}` : 'Sent by: nobody currently online')
  if (opt.subscribers.length) parts.push(`Reacted to by: ${opt.subscribers.join(', ')}`)
  return parts.join(' — ')
}

const currentOption = computed((): EventOption | null => eventOptions.value.find((o) => `${o.schema.name}:${o.schema.version}` === selectedEventKey.value) ?? null)
const currentEventSchema = computed((): EventSchema | null => currentOption.value?.schema ?? null)

const hasUnsupportedParam = computed(() => hasUnsupportedField(currentEventSchema.value?.fields ?? []))

function selectEvent(key: string) {
  selectedEventKey.value = key
  step.value = 'params'
}

function backToEventStep() {
  step.value = 'event'
}

watch(currentEventSchema, (schema) => {
  paramValues.value = Object.fromEntries((schema?.fields ?? []).map((f) => [f.name, defaultParamValue(f.type)]))
})

function toggleSender() {
  showSender.value = !showSender.value
  if (!showSender.value) {
    selectedEventKey.value = ''
    step.value = 'event'
    sendResult.value = null
  }
}

async function send() {
  const schema = currentEventSchema.value
  if (!schema) return

  const data = Object.fromEntries(schema.fields.map((f) => [f.name, paramValueFromString(paramValues.value[f.name], f.type)]))

  sending.value = true
  sendResult.value = null
  try {
    await publishEvent(schema.name, schema.version, data)
    sendResult.value = { success: true, message: `Sent ${schema.name}, published under your own JID.` }
  } catch (e) {
    sendResult.value = { success: false, message: String(e) }
  } finally {
    sending.value = false
    selectedEventKey.value = ''
    step.value = 'event'
  }
}
</script>

<template>
  <div class="d-flex flex-column" style="height: calc(100vh - 6rem)">
    <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
      <h5 class="text-body fw-semibold mb-0">Events</h5>
      <button class="btn btn-outline-secondary btn-sm ms-auto" @click="toggleSender">
        <i class="bi bi-send me-1"></i>Send event
      </button>
    </div>

    <div v-if="showSender" class="flex-shrink-0 mb-3 rounded-3 p-3 pyobs-panel-alt">
      <div class="mb-2">
        <template v-if="step === 'event'">
          <div class="text-muted mb-1 text-uppercase" style="font-size:0.65rem; letter-spacing:.06em">Event</div>
          <div class="d-flex flex-wrap gap-2">
            <button
              v-for="opt in eventOptions"
              :key="`${opt.schema.name}:${opt.schema.version}`"
              type="button"
              class="btn btn-sm"
              :class="selectedEventKey === `${opt.schema.name}:${opt.schema.version}` ? 'btn-primary' : 'btn-outline-secondary'"
              :title="roleHint(opt)"
              @click="selectEvent(`${opt.schema.name}:${opt.schema.version}`)"
            >
              {{ opt.schema.name }}
            </button>
            <span v-if="eventOptions.length === 0" class="text-muted align-self-center" style="font-size:0.8rem">
              No modules online declare any events.
            </span>
          </div>
        </template>
        <button
          v-else
          type="button"
          class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
          @click="backToEventStep"
        >
          <span class="text-muted">Event:</span> {{ currentEventSchema?.name }}
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>

      <template v-if="step === 'params' && currentEventSchema">
        <ParamForm
          v-model="paramValues"
          :fields="currentEventSchema.fields"
          :enums="currentEventSchema.enums"
          testid="send-event-params"
        />

        <button class="btn btn-primary btn-sm" :disabled="sending || hasUnsupportedParam" @click="send">
          <span v-if="sending">
            <span class="spinner-border spinner-border-sm me-1" role="status"></span>
            Sending…
          </span>
          <span v-else>
            <i class="bi bi-send me-1"></i>
            Send
          </span>
        </button>
      </template>

      <p v-if="sendResult" class="mb-0 mt-2" :class="sendResult.success ? 'text-success' : 'text-danger'" style="font-size:0.8rem">
        {{ sendResult.message }}
      </p>
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
