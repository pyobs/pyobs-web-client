<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useXmpp } from '@/composables/useXmpp'

// Compact-shell counterpart to the desktop sidebar's "Tools" section —
// everything not on a primary bottom tab (Dashboard, Logs) and not a module
// (Dashboard cards navigate to a module's ModulePageView directly now — see
// specs/plans/2026-09-06-module-page-rework.md — so this no longer needs to
// duplicate module access).
//
// Sign-out lives here too — missed entirely in the first pass (and in the
// mockup before it), since the compact shell has no sidebar to hold it.
const router = useRouter()
const { jid, disconnect } = useXmpp()

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
