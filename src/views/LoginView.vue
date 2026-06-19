<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useXmpp } from '@/composables/useXmpp'

const router = useRouter()
const { status, errorMessage, connect } = useXmpp()

const jid = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!jid.value || !password.value) return
  loading.value = true
  try {
    await connect(jid.value, password.value)
    router.push({ name: 'dashboard' })
  } catch {
    // errorMessage is set inside the composable
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="d-flex align-items-center justify-content-center vh-100"
    style="background-color: #111316"
  >
    <div style="width: 100%; max-width: 360px; padding: 0 1rem">

      <!-- Logo / header -->
      <div class="text-center mb-4">
        <i class="bi bi-telescope text-primary" style="font-size: 2.5rem"></i>
        <h5 class="text-light mt-2 mb-0 fw-semibold">pyobs Web Client</h5>
        <p class="text-muted mb-0" style="font-size:0.8rem">Sign in to continue</p>
      </div>

      <!-- Card -->
      <div
        class="rounded-3 p-4"
        style="background-color: #1a1d21; border: 1px solid #2d3035"
      >
        <!-- Error alert -->
        <div
          v-if="errorMessage"
          class="alert alert-danger d-flex align-items-center gap-2 py-2 px-3 mb-3"
          style="font-size:0.85rem"
        >
          <i class="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
          {{ errorMessage }}
        </div>

        <!-- JID -->
        <div class="mb-3">
          <label class="form-label text-muted" style="font-size:0.8rem">XMPP JID</label>
          <input
            v-model="jid"
            type="text"
            class="form-control form-control-sm bg-dark border-secondary text-light"
            placeholder="user@xmpp.example.com"
            autocomplete="username"
            :disabled="loading"
            @keyup.enter="handleLogin"
          />
        </div>

        <!-- Password -->
        <div class="mb-4">
          <label class="form-label text-muted" style="font-size:0.8rem">Password</label>
          <input
            v-model="password"
            type="password"
            class="form-control form-control-sm bg-dark border-secondary text-light"
            placeholder="••••••••"
            autocomplete="current-password"
            :disabled="loading"
            @keyup.enter="handleLogin"
          />
        </div>

        <!-- Submit -->
        <button
          class="btn btn-primary w-100 btn-sm"
          :disabled="loading || !jid || !password"
          @click="handleLogin"
        >
          <span v-if="loading">
            <span class="spinner-border spinner-border-sm me-2" role="status"></span>
            Connecting…
          </span>
          <span v-else>
            <i class="bi bi-box-arrow-in-right me-1"></i>
            Connect
          </span>
        </button>
      </div>

    </div>
  </div>
</template>
