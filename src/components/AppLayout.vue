<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useXmpp } from '@/composables/useXmpp'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useModuleNavSections } from '@/composables/useModuleNavSections'

const router = useRouter()
const route = useRoute()
const { jid, disconnect } = useXmpp()
const { isCompact } = useBreakpoint()
const { navSections } = useModuleNavSections()

function handleLogout() {
  disconnect()
  router.push({ name: 'login' })
}

function navigate(to: string) {
  router.push(to)
}

const appVersion = __APP_VERSION__
</script>

<template>
  <!-- Compact shell (below the lg breakpoint): top bar + bottom tabs,
       replacing the old hamburger-drawer version of the desktop sidebar —
       see specs/plans/mobile-first-redesign.md. Dashboard/Logs are primary
       tabs; everything else (including the per-interface module pages,
       until the ModulePage-style rework in that plan lands) is one tap away
       under More. -->
  <div v-if="isCompact" class="d-flex flex-column vh-100" style="background-color:#111316">
    <div
      class="d-flex align-items-center px-3 flex-shrink-0"
      style="height:56px; border-bottom:1px solid #2d3035"
    >
      <img src="/pyobs-logo-dark.gif" alt="pyobs" style="height:22px" />
      <button
        type="button"
        class="btn ms-auto p-0 d-flex align-items-center justify-content-center"
        style="width:40px; height:40px; color:#adb5bd"
        aria-label="Settings"
        @click="navigate('/settings')"
      >
        <i class="bi bi-sliders" style="font-size:1.1rem"></i>
      </button>
    </div>

    <main class="flex-grow-1 overflow-auto p-3">
      <RouterView />
    </main>

    <nav
      class="d-flex flex-shrink-0"
      style="background-color:#1a1d21; border-top:1px solid #2d3035; padding-bottom:10px"
    >
      <a
        class="compact-navtab"
        :class="{ active: route.name === 'dashboard' }"
        @click="navigate('/')"
      >
        <i class="bi bi-grid-fill"></i>
        <span>Dashboard</span>
      </a>
      <a
        class="compact-navtab"
        :class="{ active: route.name === 'logging' }"
        @click="navigate('/logging')"
      >
        <i class="bi bi-journal-text"></i>
        <span>Logs</span>
      </a>
      <a
        class="compact-navtab"
        :class="{ active: route.name === 'more' }"
        @click="navigate('/more')"
      >
        <i class="bi bi-three-dots"></i>
        <span>More</span>
      </a>
    </nav>
  </div>

  <!-- Desktop sidebar (unchanged) -->
  <div v-else class="d-flex">
    <nav class="sidebar d-flex" id="sidebar">
      <div class="p-3 border-bottom border-secondary-subtle">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-telescope fs-5 text-primary"></i>
          <div>
            <div class="fw-semibold text-light lh-1">pyobs</div>
            <div class="text-muted" style="font-size:0.7rem">Web Client v{{ appVersion }}</div>
          </div>
        </div>
      </div>

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

<style scoped>
.compact-navtab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 0 0;
  color: #8b929a;
  font-size: 1.3rem;
  cursor: pointer;
  text-decoration: none;
}
.compact-navtab span {
  font-size: 0.66rem;
  font-weight: 500;
}
.compact-navtab.active {
  color: #6ea8fe;
}
</style>
