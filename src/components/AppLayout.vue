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
//
// Route name is mechanical (interface name minus leading "I", lowercased —
// "IAutoGuiding" -> "autoguiding") and matches every route in router/index.ts,
// so only the interface name and icon need spelling out per entry.
const NAV_INTERFACES = [
  { interfaceName: 'IRoof', icon: 'bi-house-door' },
  { interfaceName: 'ICamera', icon: 'bi-camera' },
  { interfaceName: 'IMode', icon: 'bi-sliders' },
  { interfaceName: 'IWeather', icon: 'bi-cloud-sun' },
  { interfaceName: 'IAutoFocus', icon: 'bi-bullseye' },
  { interfaceName: 'IAutoGuiding', icon: 'bi-compass' },
  { interfaceName: 'IAcquisition', icon: 'bi-crosshair' },
] as const

const navSections = computed(() =>
  NAV_INTERFACES.map(({ interfaceName, icon }) => ({
    interfaceName,
    icon,
    routeName: interfaceName.slice(1).toLowerCase(),
    label: interfaceLabel(interfaceName),
    modules: modules.value
      .filter((m) => interfaceName in m.interfaces)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((section) => section.modules.length > 0),
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

        <template v-if="navSections.length > 0">
          <div class="px-2 pb-1 pt-2">
            <span class="text-uppercase text-muted fw-semibold" style="font-size:0.65rem;letter-spacing:.08em">Modules</span>
          </div>

          <template v-for="section in navSections" :key="section.interfaceName">
            <a
              v-if="section.modules.length === 1"
              class="sidebar-link d-flex align-items-center gap-2 px-2 py-2"
              :class="{ active: route.name === section.routeName }"
              @click="navigate(`/${section.routeName}/${section.modules[0]!.jid}`)"
            >
              <i :class="section.icon" style="font-size:0.8rem"></i>
              {{ section.label }}
            </a>

            <template v-else>
              <div class="px-2 pb-1 pt-1 d-flex align-items-center gap-2">
                <i :class="section.icon" class="text-muted" style="font-size:0.8rem"></i>
                <span class="text-muted" style="font-size:0.8rem">{{ section.label }}</span>
              </div>
              <a
                v-for="m in section.modules"
                :key="m.jid"
                class="sidebar-link d-flex align-items-center gap-2 px-2 py-2 ps-4"
                :class="{ active: route.name === section.routeName && route.params.jid === m.jid }"
                @click="navigate(`/${section.routeName}/${m.jid}`)"
              >
                {{ m.name }}
              </a>
            </template>
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
