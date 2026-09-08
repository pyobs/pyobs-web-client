<script setup lang="ts">
import { ref, computed, watch, onUnmounted, type DeepReadonly } from 'vue'
import { useRouter } from 'vue-router'
import { useXmpp, type PyobsModule } from '@/composables/useXmpp'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { interfaceLabel } from '@/utils/interfaceLabel'
import ModuleStateCard from '@/components/ModuleStateCard.vue'
import KeyValueCard from '@/components/KeyValueCard.vue'

type Module = DeepReadonly<PyobsModule>

const router = useRouter()
const { modules, subscribeState } = useXmpp()
const { isCompact } = useBreakpoint()

// Compact only: a card now navigates to its ModulePageView instead of
// expanding inline (that mechanism didn't exist when this triage board was
// first built — see specs/plans/2026-09-06-module-page-rework.md). Desktop's
// own toggleExpanded below is untouched.
function openModule(jid: string) {
  router.push({ name: 'module', params: { jid } })
}

const sortedModules = computed(() => [...modules.value].sort((a, b) => a.name.localeCompare(b.name)))

// ── Desktop (unchanged): collapsed list, lazy per-row subscriptions ────────
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

// ── Compact: status triage board ────────────────────────────────────────
// Unlike the desktop list (subscribes lazily, only for expanded rows), the
// triage grouping below needs every module's status up front — so every
// stateful interface is subscribed live as long as this view is mounted,
// not just the ones a user has expanded. A real cost, worth knowing:
// significantly more live pubsub subscriptions active on this screen than
// the desktop Dashboard ever holds at once.
type StatusEntry = { interfaceName: string; status: string }

function statefulInterfaces(mod: Module) {
  return Object.values(mod.interfaces).filter((i) => i.state)
}

const liveStatus = ref<Map<string, StatusEntry[]>>(new Map())
const subs = new Map<string, () => void>()

watch(
  modules,
  (mods) => {
    const desiredKeys = new Set<string>()
    for (const mod of mods) {
      for (const iface of statefulInterfaces(mod)) {
        const key = `${mod.jid}:${iface.name}:${iface.version}`
        desiredKeys.add(key)
        if (subs.has(key)) continue

        const { value, unsubscribe } = subscribeState(mod.jid, iface.name, iface.version)
        subs.set(key, unsubscribe)
        watch(
          value,
          (v) => {
            const status =
              v && typeof v === 'object' && 'status' in v ? String((v as { status: unknown }).status) : undefined
            const next = new Map(liveStatus.value)
            const entries = (next.get(mod.jid) ?? []).filter((e) => e.interfaceName !== iface.name)
            if (status) entries.push({ interfaceName: iface.name, status })
            next.set(mod.jid, entries)
            liveStatus.value = next
          },
          { immediate: true },
        )
      }
    }
    for (const [key, unsubscribe] of subs) {
      if (!desiredKeys.has(key)) {
        unsubscribe()
        subs.delete(key)
      }
    }
  },
  { immediate: true, deep: true },
)

onUnmounted(() => {
  for (const unsubscribe of subs.values()) unsubscribe()
  subs.clear()
})

// PARKED/POSITIONED are settled MotionStatus values, same as IDLE — a parked
// telescope or a positioned filter wheel isn't "doing something" (see #31).
const IDLE_STATUSES = new Set(['IDLE', 'READY', 'UNKNOWN', 'PARKED', 'POSITIONED'])
type Bucket = 'attention' | 'running' | 'idle'

function triageFor(jid: string): { bucket: Bucket; subtitle: string | null } {
  const entries = liveStatus.value.get(jid) ?? []
  const error = entries.find((e) => e.status.toUpperCase() === 'ERROR')
  if (error) return { bucket: 'attention', subtitle: `${error.status.toUpperCase()} — ${interfaceLabel(error.interfaceName)}` }
  const busy = entries.find((e) => !IDLE_STATUSES.has(e.status.toUpperCase()))
  if (busy) return { bucket: 'running', subtitle: `${busy.status.toUpperCase()} — ${interfaceLabel(busy.interfaceName)}` }
  return { bucket: 'idle', subtitle: null }
}

const triage = computed(() => {
  const attention: Module[] = []
  const running: Module[] = []
  const idle: Module[] = []
  const subtitles = new Map<string, string>()
  for (const mod of sortedModules.value) {
    const { bucket, subtitle } = triageFor(mod.jid)
    if (subtitle) subtitles.set(mod.jid, subtitle)
    if (bucket === 'attention') attention.push(mod)
    else if (bucket === 'running') running.push(mod)
    else idle.push(mod)
  }
  return { attention, running, idle, subtitles }
})
</script>

<template>
  <!-- Compact: status/triage board — see specs/plans/2026-09-06-mobile-first-redesign.md.
       Tapping a card navigates to its ModulePageView (see
       specs/plans/2026-09-06-module-page-rework.md) instead of expanding inline. -->
  <div v-if="isCompact" class="d-flex flex-column gap-3">
    <div v-if="modules.length === 0" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      No pyobs modules online.
    </div>

    <template v-else>
      <div v-if="triage.attention.length" class="d-flex flex-column gap-2">
        <div class="d-flex align-items-center gap-2" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:.06em; color:#ff6b6b">
          Needs attention
          <span style="background:#dc3545; color:#fff; font-size:0.65rem; font-weight:700; border-radius:8px; padding:1px 6px">{{ triage.attention.length }}</span>
        </div>
        <div
          v-for="mod in triage.attention"
          :key="mod.jid"
          class="rounded-3 d-flex align-items-center gap-2 p-3"
          style="background-color:#241a1b; border:1px solid #dc354560; cursor:pointer"
          @click="openModule(mod.jid)"
        >
          <span class="status-dot" style="background:#dc3545"></span>
          <div class="flex-grow-1" style="min-width:0">
            <div class="text-light fw-semibold text-truncate" style="font-size:1rem">{{ mod.name }}</div>
            <div class="text-truncate" style="font-size:0.8rem; color:#ff8f8f">{{ triage.subtitles.get(mod.jid) }}</div>
          </div>
          <i class="bi bi-chevron-right flex-shrink-0" style="font-size:0.8rem; color:#6c757d"></i>
        </div>
      </div>

      <div v-if="triage.running.length" class="d-flex flex-column gap-2">
        <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:.06em; color:#ffca6a">Running</div>
        <div
          v-for="mod in triage.running"
          :key="mod.jid"
          class="rounded-3 d-flex align-items-center gap-2 p-3"
          style="background-color:#1a1d21; border:1px solid #ffca6a40; cursor:pointer"
          @click="openModule(mod.jid)"
        >
          <span class="status-dot" style="background:#ffca6a"></span>
          <div class="flex-grow-1" style="min-width:0">
            <div class="text-light fw-semibold text-truncate" style="font-size:1rem">{{ mod.name }}</div>
            <div class="text-truncate" style="font-size:0.8rem; color:#ffca6a">{{ triage.subtitles.get(mod.jid) }}</div>
          </div>
          <i class="bi bi-chevron-right flex-shrink-0" style="font-size:0.8rem; color:#6c757d"></i>
        </div>
      </div>

      <div v-if="triage.idle.length" class="d-flex flex-column gap-2">
        <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:.06em; color:#6c757d">Idle · nominal</div>
        <div class="rounded-3" style="background-color:#1a1d21; border:1px solid #2d3035">
          <div
            v-for="(mod, i) in triage.idle"
            :key="mod.jid"
            class="d-flex align-items-center gap-2 px-3"
            style="min-height:48px; cursor:pointer"
            :style="i > 0 ? 'border-top:1px solid #2d3035' : ''"
            @click="openModule(mod.jid)"
          >
            <span class="status-dot online"></span>
            <div class="flex-grow-1 text-truncate" style="font-size:0.9rem; color:#ced4da">{{ mod.name }}</div>
            <i class="bi bi-chevron-right flex-shrink-0" style="font-size:0.75rem; color:#6c757d"></i>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- Desktop (unchanged) -->
  <div v-else style="max-width: 800px">
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
            v-for="iface in statefulInterfaces(mod)"
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
