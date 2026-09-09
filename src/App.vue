<script setup lang="ts">
import { onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import LoginView from '@/views/LoginView.vue'
import { useXmpp } from '@/composables/useXmpp'
import { usePushNotifications } from '@/composables/usePushNotifications'
import { useExitGuard } from '@/composables/useExitGuard'
import { useKeyboardAvoidance } from '@/composables/useKeyboardAvoidance'

const { status } = useXmpp()

// A no-op on the web (see usePushNotifications.ts) — safe to call
// unconditionally regardless of login state.
onMounted(() => usePushNotifications().initialize())

const { showConfirmExit, cancelExit, confirmExit } = useExitGuard()
useKeyboardAvoidance()
</script>

<template>
  <!-- Full-screen spinner while (re)connecting — prevents login-screen flash on reload -->
  <div
    v-if="status === 'connecting'"
    class="d-flex align-items-center justify-content-center vh-100"
    style="background-color: #111316"
  >
    <span class="text-muted" style="font-size:0.9rem">
      <span class="spinner-border spinner-border-sm me-2" role="status"></span>
      Connecting…
    </span>
  </div>

  <LoginView v-else-if="status !== 'connected'" />
  <AppLayout v-else />

  <!-- Guards against an accidental edge-swipe-back exiting the app from
       Dashboard — see useExitGuard.ts / issue #45. -->
  <div
    v-if="showConfirmExit"
    class="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
    style="background-color: rgba(0, 0, 0, 0.6); z-index: 1050"
    @click.self="cancelExit"
  >
    <div class="pyobs-card" style="max-width: 320px">
      <p class="text-light mb-1" style="font-size: 0.9rem">Exit pyobs?</p>
      <!-- A page can't force-close its own tab/PWA (browser security) — "Exit"
           just stops re-arming the guard, so the next back-gesture actually
           goes through instead of asking again. -->
      <p class="text-secondary mb-3" style="font-size: 0.75rem">Swipe back again to actually close.</p>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-outline-secondary btn-sm flex-fill" @click="cancelExit">Stay</button>
        <button type="button" class="btn btn-danger btn-sm flex-fill" @click="confirmExit">Exit</button>
      </div>
    </div>
  </div>
</template>
