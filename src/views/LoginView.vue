<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Strophe } from 'strophe.js'
import { useXmpp } from '@/composables/useXmpp'
import { useServerConfig } from '@/composables/useServerConfig'
import { useCredentialStore } from '@/composables/useCredentialStore'
import ConnectionsView from '@/views/ConnectionsView.vue'
import EditConnectionView from '@/views/EditConnectionView.vue'

const router = useRouter()
const { status, errorMessage, connect, recentLogins } = useXmpp()
// The app opens on the Connections screen, not the login form — that's the
// actual offline-usable entry point; "Connect" on a saved profile is what
// gets you to the password step below; "⋯" on a saved profile opens the
// edit screen instead.
const screen = ref<'connections' | 'login' | 'edit'>('connections')
const editingJid = ref('')

function openEdit(jid: string) {
  editingJid.value = jid
  screen.value = 'edit'
}
const { getForceSecure, setForceSecure, getPort, setPort } = useServerConfig()
const { getPassword, setPassword } = useCredentialStore()

const jid = ref('')
const password = ref('')
const rememberPassword = ref(false)
const loading = ref(false)

// Two-step flow (JID + WS override, then password) so a password manager can
// still correlate the two: both fields live in one <form>, submitted once at the
// end — the JID <input> stays mounted (toggled with v-show, never v-if) across
// both steps so autofill/save-password heuristics keyed on that node don't break.
const step = ref<'jid' | 'password'>('jid')
const passwordInput = ref<HTMLInputElement | null>(null)

function goToPassword() {
  if (!jid.value) return
  step.value = 'password'
  nextTick(() => passwordInput.value?.focus())
}

function goBackToJid() {
  step.value = 'jid'
}

// Only a real user@domain shape counts — Strophe.getDomainFromJid treats a
// bare, @-less string as a domain-only JID (valid XMPP, but not what a
// partially-typed JID here means), which used to persist a `forceSecure`
// override for every single keystroke before the "@" appeared (e.g. "a",
// "ad", "adm", ...) via the watcher below.
const domain = computed(() => (jid.value.includes('@') ? (Strophe.getDomainFromJid(jid.value) ?? '') : ''))

// The checkbox defaults to checked, so a newly-seen domain needs an explicit
// `true` override persisted the moment it's known — otherwise connecting before
// ever touching the checkbox would silently fall back to auto-detection instead
// of the (checked) state actually shown.
watch(
  domain,
  (d) => {
    if (d && getForceSecure(d) === undefined) setForceSecure(d, true)
  },
  { immediate: true },
)

const forceSecure = computed<boolean>({
  get: () => getForceSecure(domain.value) ?? true,
  set: (value) => {
    if (!domain.value) return
    setForceSecure(domain.value, value)
  },
})

// Blank means "no override" (auto/default port), not "port 0" — only a valid
// 1-65535 integer is ever persisted; anything else (blank, non-numeric, out
// of range) clears the override instead of persisting garbage.
const portInput = computed<string>({
  get: () => getPort(domain.value)?.toString() ?? '',
  set: (value) => {
    if (!domain.value) return
    const trimmed = value.trim()
    if (!trimmed) {
      setPort(domain.value, undefined)
      return
    }
    const parsed = Number(trimmed)
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) setPort(domain.value, parsed)
  },
})

const appVersion = __APP_VERSION__

function pickRecentLogin(recentJid: string) {
  jid.value = recentJid
  goToPassword()
}

// "Connect" on a saved profile in the Connections screen: if a password was
// remembered for it, skip straight to a connect attempt — that's the whole
// point of remembering it. Otherwise prefill the JID and stop at the
// password step like any other manual login.
async function onConnectFromConnections(selectedJid: string) {
  jid.value = selectedJid
  screen.value = 'login'
  const bareJid = Strophe.getBareJidFromJid(selectedJid) ?? selectedJid
  const savedPassword = await getPassword(bareJid)
  if (savedPassword) {
    password.value = savedPassword
    step.value = 'password'
    await handleLogin()
  } else {
    goToPassword()
  }
}

async function handleLogin() {
  if (!jid.value || !password.value) return
  loading.value = true
  try {
    await connect(jid.value, password.value)
    if (rememberPassword.value) {
      const bareJid = Strophe.getBareJidFromJid(jid.value) ?? jid.value
      await setPassword(bareJid, password.value)
    }
    // replace, not push: Login must never be a real back-target once
    // authenticated (the router guard bounces straight back out of it
    // anyway) — on Android this left Login sitting in the native WebView
    // back-stack behind Dashboard, so swiping back from Dashboard tried to
    // land on Login, got redirected, and exited the app instead of behaving
    // like a normal "back on the home screen" exit.
    router.replace({ name: 'dashboard' })
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
    <div :style="{ width: '100%', maxWidth: screen === 'login' ? '360px' : '480px', padding: '0 1rem' }">

      <ConnectionsView
        v-if="screen === 'connections'"
        @connect="onConnectFromConnections"
        @edit="openEdit"
      />

      <EditConnectionView
        v-else-if="screen === 'edit'"
        :jid="editingJid"
        @back="screen = 'connections'"
      />

      <template v-else>
      <!-- Logo / header -->
      <div class="text-center mb-4">
        <i class="bi bi-telescope text-primary" style="font-size: 2.5rem"></i>
        <h5 class="text-light mt-2 mb-0 fw-semibold">pyobs Web Client</h5>
        <p class="text-muted mb-0" style="font-size:0.8rem">Sign in to continue</p>
        <p class="text-muted mb-0" style="font-size:0.7rem">v{{ appVersion }}</p>
      </div>

      <!-- Card -->
      <div
        class="rounded-3 p-4"
        style="background-color: #1a1d21; border: 1px solid #2d3035"
      >
        <!-- Wrapped in a real <form> (not just a JS-bound button) so the browser's
             own password manager recognizes this as a login form and offers to save/
             autofill credentials — we deliberately don't store passwords ourselves. -->
        <form @submit.prevent="handleLogin">
          <!-- Error alert -->
          <div
            v-if="errorMessage"
            class="alert alert-danger d-flex align-items-center gap-2 py-2 px-3 mb-3"
            style="font-size:0.85rem"
          >
            <i class="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
            {{ errorMessage }}
          </div>

          <!-- Recent logins (step 1 only) -->
          <div v-if="step === 'jid' && recentLogins.length" class="mb-3">
            <label class="form-label text-muted" style="font-size:0.8rem">Recent logins</label>
            <div class="d-flex flex-wrap gap-2">
              <button
                v-for="recentJid in recentLogins"
                :key="recentJid"
                type="button"
                class="btn btn-outline-secondary btn-sm"
                :disabled="loading"
                @click="pickRecentLogin(recentJid)"
              >
                {{ recentJid }}
              </button>
            </div>
          </div>

          <div v-if="step === 'jid'" class="mb-3 text-end">
            <button type="button" class="btn btn-link btn-sm p-0 text-muted" style="font-size:0.75rem" @click="screen = 'connections'">
              <i class="bi bi-gear me-1"></i>Manage connections
            </button>
          </div>

          <!-- Step 2 recap: the real JID input below stays mounted (v-show, not
               v-if) so the browser keeps correlating it as the username for this
               password field — this recap is just what's visually shown instead. -->
          <div v-if="step === 'password'" class="mb-3 d-flex align-items-center justify-content-between">
            <span class="text-light" style="font-size:0.85rem">{{ jid }}</span>
            <button type="button" class="btn btn-link btn-sm p-0" :disabled="loading" @click="goBackToJid">
              Change
            </button>
          </div>

          <!-- JID -->
          <div v-show="step === 'jid'" class="mb-3">
            <label class="form-label text-muted" style="font-size:0.8rem">XMPP JID</label>
            <input
              v-model="jid"
              type="text"
              class="form-control form-control-sm bg-dark border-secondary text-light"
              placeholder="user@xmpp.example.com"
              autocomplete="username"
              :disabled="loading"
              @keydown.enter.prevent="goToPassword"
            />
          </div>

          <!-- Per-domain WS scheme override (step 1 only) -->
          <div v-if="step === 'jid'" class="mb-3 form-check">
            <input
              id="forceSecureWs"
              v-model="forceSecure"
              type="checkbox"
              class="form-check-input"
              :disabled="!domain"
            />
            <label class="form-check-label text-muted" for="forceSecureWs" style="font-size:0.8rem">
              Use secure WebSocket (wss) for this server
            </label>
          </div>

          <!-- Per-domain WS port override (step 1 only) -->
          <div v-if="step === 'jid'" class="mb-3">
            <label class="form-label text-muted" for="wsPort" style="font-size:0.8rem">
              WebSocket port <span class="text-secondary">(optional)</span>
            </label>
            <input
              id="wsPort"
              v-model="portInput"
              type="text"
              inputmode="numeric"
              class="form-control form-control-sm bg-dark border-secondary text-light"
              placeholder="default (443/80)"
              :disabled="!domain"
            />
          </div>

          <!-- Continue (step 1 -> step 2) -->
          <button
            v-if="step === 'jid'"
            type="button"
            class="btn btn-primary w-100 btn-sm"
            :disabled="!jid"
            @click="goToPassword"
          >
            Continue
          </button>

          <!-- Password (step 2 only) -->
          <div v-if="step === 'password'" class="mb-4">
            <label class="form-label text-muted" style="font-size:0.8rem">Password</label>
            <input
              ref="passwordInput"
              v-model="password"
              type="password"
              class="form-control form-control-sm bg-dark border-secondary text-light"
              placeholder="••••••••"
              autocomplete="current-password"
              :disabled="loading"
            />
          </div>

          <!-- Opt-in password storage (step 2 only) — off by default, see
               useCredentialStore.ts for where this ends up. -->
          <div v-if="step === 'password'" class="mb-4 form-check">
            <input
              id="rememberPassword"
              v-model="rememberPassword"
              type="checkbox"
              class="form-check-input"
              :disabled="loading"
            />
            <label class="form-check-label text-muted" for="rememberPassword" style="font-size:0.8rem">
              Remember password on this device
            </label>
          </div>

          <!-- Submit (step 2 only) -->
          <button
            v-if="step === 'password'"
            type="submit"
            class="btn btn-primary w-100 btn-sm"
            :disabled="loading || !jid || !password"
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
        </form>
      </div>
      </template>

    </div>
  </div>
</template>
