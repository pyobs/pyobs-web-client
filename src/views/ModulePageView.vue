<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useXmpp } from '@/composables/useXmpp'
import { widgetsForModule } from '@/moduleWidgets'

// One nav destination per module — see specs/plans/module-page-rework.md. Resolves the module
// directly by jid (not filtered by interface, unlike the 7 views this replaces), then renders a
// tab per matching widget entry, or the single match directly with no tab chrome.
const route = useRoute()
const router = useRouter()
const { modules } = useXmpp()

const jid = computed(() => route.params.jid as string)
const currentModule = computed(() => modules.value.find((m) => m.jid === jid.value))
const widgets = computed(() => (currentModule.value ? widgetsForModule(currentModule.value) : []))

const activeTab = computed(() => route.params.tab as string | undefined)
const activeWidget = computed(
  () => widgets.value.find((w) => w.routeName === activeTab.value) ?? widgets.value[0],
)

// Missing or unmatched :tab settles on the first widget, mirroring the old per-view "redirect to
// a definite state" pattern (each of the 7 views used to do this for a missing :jid).
watchEffect(() => {
  if (widgets.value.length > 0 && !widgets.value.some((w) => w.routeName === activeTab.value)) {
    router.replace({ name: 'module', params: { jid: jid.value, tab: widgets.value[0]!.routeName } })
  }
})

function selectTab(routeName: string) {
  router.replace({ name: 'module', params: { jid: jid.value, tab: routeName } })
}
</script>

<template>
  <div v-if="!currentModule" class="text-muted" style="font-size:0.9rem">
    <i class="bi bi-info-circle me-1"></i>
    Module "{{ jid }}" is not online.
  </div>

  <div v-else style="max-width: 800px">
    <div class="d-flex align-items-center gap-2 mb-3">
      <span class="status-dot online flex-shrink-0"></span>
      <h5 class="text-light fw-semibold mb-0">{{ currentModule.name }}</h5>
      <span class="text-muted text-truncate" style="font-size:0.8rem">{{ currentModule.jid }}</span>
    </div>

    <ul v-if="widgets.length > 1" class="nav nav-tabs mb-3">
      <li v-for="w in widgets" :key="w.routeName" class="nav-item">
        <a
          class="nav-link"
          :class="{ active: w.routeName === activeWidget?.routeName }"
          style="cursor:pointer"
          @click="selectTab(w.routeName)"
        >
          <i :class="w.icon" class="me-1"></i>{{ w.label }}
        </a>
      </li>
    </ul>

    <component :is="activeWidget.component" v-if="activeWidget" :jid="currentModule.jid" />

    <!-- Shared section (filters/temperatures/FITS headers/etc., visible regardless of active
         tab) — no consumer exists in this app yet; see "Shared section" in
         specs/plans/module-page-rework.md before adding one here. -->
  </div>
</template>
