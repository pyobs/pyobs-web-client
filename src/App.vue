<script setup lang="ts">
import { onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import LoginView from '@/views/LoginView.vue'
import { useXmpp } from '@/composables/useXmpp'
import { usePushNotifications } from '@/composables/usePushNotifications'

const { status } = useXmpp()

// A no-op on the web (see usePushNotifications.ts) — safe to call
// unconditionally regardless of login state.
onMounted(() => usePushNotifications().initialize())
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
</template>
