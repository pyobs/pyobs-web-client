<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useXmpp } from '@/composables/useXmpp'
import { useModuleNavSections } from '@/composables/useModuleNavSections'

// Compact-shell counterpart to the desktop sidebar's "Tools"/"Modules"
// sections — everything not on a primary bottom tab (Dashboard, Logs).
// Still lists the per-interface module pages directly, same as the sidebar
// does today: the module-grouped drill-down (tabs per interface, mirroring
// pyobs-gui's ModulePage — see specs/plans/mobile-first-redesign.md) is a
// separate, not-yet-built piece of work, not part of this pass.
//
// Sign-out lives here too — missed entirely in the first pass (and in the
// mockup before it), since the compact shell has no sidebar to hold it.
const router = useRouter()
const { jid, disconnect } = useXmpp()
const { navSections } = useModuleNavSections()

function navigate(to: string) {
  router.push(to)
}

function handleLogout() {
  disconnect()
  router.push({ name: 'login' })
}
</script>

<template>
  <div>
    <h5 class="text-light fw-semibold mb-3">More</h5>

    <div class="rounded-3" style="background-color:#1a1d21; border:1px solid #2d3035; overflow:hidden">
      <a class="more-row" @click="navigate('/events')">
        <i class="bi bi-broadcast"></i>
        <span class="flex-grow-1">Events</span>
        <i class="bi bi-chevron-right text-secondary" style="font-size:0.8rem"></i>
      </a>
      <a class="more-row" @click="navigate('/shell')">
        <i class="bi bi-terminal"></i>
        <span class="flex-grow-1">Shell</span>
        <i class="bi bi-chevron-right text-secondary" style="font-size:0.8rem"></i>
      </a>
      <a class="more-row" @click="navigate('/settings')">
        <i class="bi bi-gear"></i>
        <span class="flex-grow-1">Settings</span>
        <i class="bi bi-chevron-right text-secondary" style="font-size:0.8rem"></i>
      </a>

      <template v-for="section in navSections" :key="section.interfaceName">
        <a
          v-if="section.modules.length === 1"
          class="more-row"
          @click="navigate(`/${section.routeName}/${section.modules[0]!.jid}`)"
        >
          <i :class="section.icon"></i>
          <span class="flex-grow-1">{{ section.label }}</span>
          <i class="bi bi-chevron-right text-secondary" style="font-size:0.8rem"></i>
        </a>
        <a
          v-for="m in section.modules.length > 1 ? section.modules : []"
          :key="m.jid"
          class="more-row"
          @click="navigate(`/${section.routeName}/${m.jid}`)"
        >
          <i :class="section.icon"></i>
          <span class="flex-grow-1">{{ section.label }} — {{ m.name }}</span>
          <i class="bi bi-chevron-right text-secondary" style="font-size:0.8rem"></i>
        </a>
      </template>
    </div>

    <button
      type="button"
      class="more-row w-100 border-0 bg-transparent text-start rounded-3 mt-3"
      style="border:1px solid #2d3035 !important"
      @click="handleLogout"
    >
      <i class="bi bi-box-arrow-left"></i>
      <span class="flex-grow-1 text-truncate">{{ jid }}</span>
      <span class="text-muted" style="font-size:0.8rem">sign out</span>
    </button>
  </div>
</template>

<style scoped>
.more-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 16px;
  min-height: 56px;
  border-bottom: 1px solid #2d3035;
  color: #e9ecef;
  cursor: pointer;
  text-decoration: none;
}
.more-row:last-child {
  border-bottom: none;
}
.more-row > i:first-child {
  color: #8b929a;
  font-size: 1rem;
  flex-shrink: 0;
}
</style>
