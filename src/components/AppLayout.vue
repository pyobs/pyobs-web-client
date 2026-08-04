<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useXmpp } from '@/composables/useXmpp'
import { interfaceLabel } from '@/utils/interfaceLabel'

const router = useRouter()
const route = useRoute()
const { jid, disconnect, modules } = useXmpp()

// One sidebar entry per multi-instance interface: a single link when
// exactly one module implementing it is online (no header/indent overhead
// for the common case), or a section header with one sub-link per module
// when there are several. See
// specs/design/interface-nav-per-module-routes.md.
const roofModules = computed(() =>
  modules.value.filter((m) => 'IRoof' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)
const modeModules = computed(() =>
  modules.value.filter((m) => 'IMode' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)
const weatherModules = computed(() =>
  modules.value.filter((m) => 'IWeather' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)
const autoFocusModules = computed(() =>
  modules.value.filter((m) => 'IAutoFocus' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)
const autoGuidingModules = computed(() =>
  modules.value.filter((m) => 'IAutoGuiding' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)

const sidebarOpen = ref(false)

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function closeSidebar() {
  sidebarOpen.value = false
}

function handleLogout() {
  disconnect()
  router.push({ name: 'login' })
}

function navigate(to: string) {
  router.push(to)
  closeSidebar()
}

const appVersion = __APP_VERSION__
</script>

<template>
  <!-- Mobile top navbar -->
  <nav
    class="d-lg-none d-flex align-items-center px-3 bg-dark border-bottom border-secondary-subtle sticky-top"
    style="height:52px; z-index:1043"
  >
    <i class="bi bi-telescope text-primary me-2"></i>
    <span class="text-light fw-semibold me-auto">pyobs</span>
    <button class="btn btn-outline-secondary btn-sm" @click="toggleSidebar">
      <i class="bi bi-list fs-5"></i>
    </button>
  </nav>

  <!-- Sidebar backdrop (mobile) -->
  <div
    id="sidebar-overlay"
    class="sidebar-overlay"
    :class="{ active: sidebarOpen }"
    @click="closeSidebar"
  ></div>

  <div class="d-flex">
    <nav class="sidebar" id="sidebar" :class="{ open: sidebarOpen }">

      <!-- Desktop header -->
      <div class="p-3 border-bottom border-secondary-subtle d-none d-lg-block">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-telescope fs-5 text-primary"></i>
          <div>
            <div class="fw-semibold text-light lh-1">pyobs</div>
            <div class="text-muted" style="font-size:0.7rem">Web Client v{{ appVersion }}</div>
          </div>
        </div>
      </div>

      <!-- Mobile header with close button -->
      <div class="p-3 border-bottom border-secondary-subtle d-flex d-lg-none align-items-center gap-2">
        <i class="bi bi-telescope fs-5 text-primary"></i>
        <div class="me-auto">
          <div class="fw-semibold text-light lh-1">pyobs</div>
          <div class="text-muted" style="font-size:0.7rem">Web Client v{{ appVersion }}</div>
        </div>
        <button class="btn btn-sm btn-outline-secondary" @click="closeSidebar">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>

      <!-- Nav links -->
      <div class="p-2 flex-grow-1 overflow-auto">

        <div class="px-2 py-2">
          <a
            class="sidebar-link d-flex align-items-center gap-2 px-2 py-2"
            :class="{ active: route.name === 'dashboard' }"
            @click="navigate('/')"
          >
            <i class="bi bi-grid-fill" style="font-size:0.8rem"></i>
            Dashboard
          </a>
        </div>

        <div class="px-2 pb-1">
          <span class="text-uppercase text-muted fw-semibold" style="font-size:0.65rem;letter-spacing:.08em">Tools</span>
        </div>

        <a
          class="sidebar-link d-flex align-items-center gap-2 px-2 py-2"
          :class="{ active: route.name === 'shell' }"
          @click="navigate('/shell')"
        >
          <i class="bi bi-terminal" style="font-size:0.8rem"></i>
          Shell
        </a>

        <a
          class="sidebar-link d-flex align-items-center gap-2 px-2 py-2"
          :class="{ active: route.name === 'logging' }"
          @click="navigate('/logging')"
        >
          <i class="bi bi-journal-text" style="font-size:0.8rem"></i>
          Logging
        </a>

        <a
          class="sidebar-link d-flex align-items-center gap-2 px-2 py-2"
          :class="{ active: route.name === 'events' }"
          @click="navigate('/events')"
        >
          <i class="bi bi-broadcast" style="font-size:0.8rem"></i>
          Events
        </a>

        <a
          class="sidebar-link d-flex align-items-center gap-2 px-2 py-2"
          :class="{ active: route.name === 'settings' }"
          @click="navigate('/settings')"
        >
          <i class="bi bi-gear" style="font-size:0.8rem"></i>
          Settings
        </a>

        <template v-if="roofModules.length > 0 || modeModules.length > 0 || weatherModules.length > 0 || autoFocusModules.length > 0 || autoGuidingModules.length > 0">
          <div class="px-2 pb-1 pt-2">
            <span class="text-uppercase text-muted fw-semibold" style="font-size:0.65rem;letter-spacing:.08em">Modules</span>
          </div>

          <a
            v-if="roofModules.length === 1"
            class="sidebar-link d-flex align-items-center gap-2 px-2 py-2"
            :class="{ active: route.name === 'roof' }"
            @click="navigate(`/roof/${roofModules[0]!.jid}`)"
          >
            <i class="bi bi-house-door" style="font-size:0.8rem"></i>
            {{ interfaceLabel('IRoof') }}
          </a>

          <template v-else-if="roofModules.length > 1">
            <div class="px-2 pb-1 pt-1 d-flex align-items-center gap-2">
              <i class="bi bi-house-door text-muted" style="font-size:0.8rem"></i>
              <span class="text-muted" style="font-size:0.8rem">{{ interfaceLabel('IRoof') }}</span>
            </div>
            <a
              v-for="m in roofModules"
              :key="m.jid"
              class="sidebar-link d-flex align-items-center gap-2 px-2 py-2 ps-4"
              :class="{ active: route.name === 'roof' && route.params.jid === m.jid }"
              @click="navigate(`/roof/${m.jid}`)"
            >
              {{ m.name }}
            </a>
          </template>

          <a
            v-if="modeModules.length === 1"
            class="sidebar-link d-flex align-items-center gap-2 px-2 py-2"
            :class="{ active: route.name === 'mode' }"
            @click="navigate(`/mode/${modeModules[0]!.jid}`)"
          >
            <i class="bi bi-sliders" style="font-size:0.8rem"></i>
            {{ interfaceLabel('IMode') }}
          </a>

          <template v-else-if="modeModules.length > 1">
            <div class="px-2 pb-1 pt-1 d-flex align-items-center gap-2">
              <i class="bi bi-sliders text-muted" style="font-size:0.8rem"></i>
              <span class="text-muted" style="font-size:0.8rem">{{ interfaceLabel('IMode') }}</span>
            </div>
            <a
              v-for="m in modeModules"
              :key="m.jid"
              class="sidebar-link d-flex align-items-center gap-2 px-2 py-2 ps-4"
              :class="{ active: route.name === 'mode' && route.params.jid === m.jid }"
              @click="navigate(`/mode/${m.jid}`)"
            >
              {{ m.name }}
            </a>
          </template>

          <a
            v-if="weatherModules.length === 1"
            class="sidebar-link d-flex align-items-center gap-2 px-2 py-2"
            :class="{ active: route.name === 'weather' }"
            @click="navigate(`/weather/${weatherModules[0]!.jid}`)"
          >
            <i class="bi bi-cloud-sun" style="font-size:0.8rem"></i>
            {{ interfaceLabel('IWeather') }}
          </a>

          <template v-else-if="weatherModules.length > 1">
            <div class="px-2 pb-1 pt-1 d-flex align-items-center gap-2">
              <i class="bi bi-cloud-sun text-muted" style="font-size:0.8rem"></i>
              <span class="text-muted" style="font-size:0.8rem">{{ interfaceLabel('IWeather') }}</span>
            </div>
            <a
              v-for="m in weatherModules"
              :key="m.jid"
              class="sidebar-link d-flex align-items-center gap-2 px-2 py-2 ps-4"
              :class="{ active: route.name === 'weather' && route.params.jid === m.jid }"
              @click="navigate(`/weather/${m.jid}`)"
            >
              {{ m.name }}
            </a>
          </template>

          <a
            v-if="autoFocusModules.length === 1"
            class="sidebar-link d-flex align-items-center gap-2 px-2 py-2"
            :class="{ active: route.name === 'autofocus' }"
            @click="navigate(`/autofocus/${autoFocusModules[0]!.jid}`)"
          >
            <i class="bi bi-bullseye" style="font-size:0.8rem"></i>
            {{ interfaceLabel('IAutoFocus') }}
          </a>

          <template v-else-if="autoFocusModules.length > 1">
            <div class="px-2 pb-1 pt-1 d-flex align-items-center gap-2">
              <i class="bi bi-bullseye text-muted" style="font-size:0.8rem"></i>
              <span class="text-muted" style="font-size:0.8rem">{{ interfaceLabel('IAutoFocus') }}</span>
            </div>
            <a
              v-for="m in autoFocusModules"
              :key="m.jid"
              class="sidebar-link d-flex align-items-center gap-2 px-2 py-2 ps-4"
              :class="{ active: route.name === 'autofocus' && route.params.jid === m.jid }"
              @click="navigate(`/autofocus/${m.jid}`)"
            >
              {{ m.name }}
            </a>
          </template>

          <a
            v-if="autoGuidingModules.length === 1"
            class="sidebar-link d-flex align-items-center gap-2 px-2 py-2"
            :class="{ active: route.name === 'autoguiding' }"
            @click="navigate(`/autoguiding/${autoGuidingModules[0]!.jid}`)"
          >
            <i class="bi bi-compass" style="font-size:0.8rem"></i>
            {{ interfaceLabel('IAutoGuiding') }}
          </a>

          <template v-else-if="autoGuidingModules.length > 1">
            <div class="px-2 pb-1 pt-1 d-flex align-items-center gap-2">
              <i class="bi bi-compass text-muted" style="font-size:0.8rem"></i>
              <span class="text-muted" style="font-size:0.8rem">{{ interfaceLabel('IAutoGuiding') }}</span>
            </div>
            <a
              v-for="m in autoGuidingModules"
              :key="m.jid"
              class="sidebar-link d-flex align-items-center gap-2 px-2 py-2 ps-4"
              :class="{ active: route.name === 'autoguiding' && route.params.jid === m.jid }"
              @click="navigate(`/autoguiding/${m.jid}`)"
            >
              {{ m.name }}
            </a>
          </template>
        </template>

      </div>

      <!-- Logout / user -->
      <div class="p-2 border-top border-secondary-subtle">
        <button
          class="sidebar-link d-flex align-items-center gap-2 px-2 py-2 w-100 border-0 bg-transparent text-start"
          @click="handleLogout"
        >
          <i class="bi bi-box-arrow-left" style="font-size:0.8rem"></i>
          <span class="text-truncate" style="max-width:160px">{{ jid }}</span>
          <span class="ms-auto text-muted small">sign out</span>
        </button>
      </div>

    </nav>

    <main class="main-content flex-grow-1 p-3 p-lg-4">
      <RouterView />
    </main>
  </div>
</template>
