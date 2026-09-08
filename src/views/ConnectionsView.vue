<script setup lang="ts">
import { ref, watch } from 'vue'
import { Strophe } from 'strophe.js'
import { useXmpp } from '@/composables/useXmpp'
import { useCredentialStore } from '@/composables/useCredentialStore'

// Offline-usable app start screen: saved JIDs (recentLogins, addable without
// ever connecting), each showing whether a password is remembered. Editing
// a connection's server/VFS settings moved to EditConnectionView.vue (see
// mobile-first-redesign.md's Connections mockup) — this screen just lists
// and adds/removes.

const emit = defineEmits<{ connect: [jid: string]; edit: [jid: string] }>()

const { recentLogins, rememberLogin, forgetLogin } = useXmpp()
const { getPassword, setPassword, removePassword } = useCredentialStore()

const appVersion = __APP_VERSION__

function bareJidOf(jid: string): string {
  return Strophe.getBareJidFromJid(jid) ?? jid
}

const jidsWithSavedPassword = ref<Set<string>>(new Set())

async function refreshPasswordFlags() {
  const flags = await Promise.all(
    recentLogins.value.map(async (entry) => [entry.jid, (await getPassword(bareJidOf(entry.jid))) !== null] as const),
  )
  jidsWithSavedPassword.value = new Set(flags.filter(([, has]) => has).map(([j]) => j))
}

watch(recentLogins, refreshPasswordFlags, { immediate: true })

function connectTo(jid: string) {
  emit('connect', jid)
}

function editConnection(jid: string) {
  emit('edit', jid)
}

// Removing a connection from this list (not from EditConnectionView's
// explicit "Remove connection") also drops its stored password — leaving
// an orphaned secret around for a JID no longer listed isn't a good default.
function removeConnection(jid: string) {
  forgetLogin(jid)
  removePassword(bareJidOf(jid))
}

const showAddSheet = ref(false)
const newJid = ref('')
const newLabel = ref('')
const newPassword = ref('')

function openAddSheet() {
  newJid.value = ''
  newLabel.value = ''
  newPassword.value = ''
  showAddSheet.value = true
}

async function confirmAdd() {
  const j = newJid.value.trim()
  if (!j) return
  rememberLogin(j, newLabel.value.trim() || undefined)
  if (newPassword.value) {
    await setPassword(bareJidOf(j), newPassword.value)
    await refreshPasswordFlags()
  }
  showAddSheet.value = false
}
</script>

<template>
  <div style="position:relative">
    <div class="d-flex flex-column align-items-center gap-2 mb-4">
      <img src="/pyobs-logo-dark.gif" alt="pyobs" style="height:30px" />
      <div class="text-muted text-center" style="font-size:0.8rem">
        Saved connections work offline — add, edit, or remove them without a live server.
      </div>
    </div>

    <div class="text-muted mb-2" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:.06em">
      Saved connections
    </div>

    <p v-if="recentLogins.length === 0" class="text-muted" style="font-size:0.85rem">
      <i class="bi bi-info-circle me-1"></i>
      No saved connections yet.
    </p>

    <div
      v-for="entry in recentLogins"
      :key="entry.jid"
      class="rounded-3 mb-2"
      style="background-color:#1a1d21; border:1px solid #2d3035"
    >
      <div class="d-flex align-items-center gap-2" style="min-height:64px; padding:14px 8px 14px 16px; cursor:pointer" @click="connectTo(entry.jid)">
        <div class="flex-grow-1 text-break" style="min-width:0">
          <div class="text-light fw-semibold text-truncate" style="font-size:0.98rem">{{ entry.label || entry.jid }}</div>
          <div v-if="entry.label" class="text-muted text-truncate" style="font-size:0.78rem">{{ entry.jid }}</div>
          <div class="d-flex align-items-center gap-1" style="font-size:0.78rem" :class="jidsWithSavedPassword.has(entry.jid) ? 'text-info' : 'text-muted'">
            <i v-if="jidsWithSavedPassword.has(entry.jid)" class="bi bi-lock-fill"></i>
            {{ jidsWithSavedPassword.has(entry.jid) ? 'Password saved' : 'No saved password' }}
          </div>
        </div>
        <button
          type="button"
          class="btn p-0 d-flex align-items-center justify-content-center flex-shrink-0"
          style="width:40px; height:40px; color:#8b929a"
          title="Edit connection"
          @click.stop="editConnection(entry.jid)"
        >
          <i class="bi bi-three-dots"></i>
        </button>
      </div>
    </div>

    <p class="text-muted mt-2" style="font-size:0.75rem">
      Tap a connection to sign in. Use ⋯ to edit its server/VFS settings or remove it.
    </p>

    <!-- Kept as a fallback next to the list itself (not just the FAB) since
         a plain link is easier to find without touch-target guessing. -->
    <button type="button" class="btn btn-link btn-sm text-muted p-0" style="font-size:0.8rem" @click="openAddSheet">
      <i class="bi bi-plus-lg me-1"></i>Add a connection
    </button>

    <button
      type="button"
      class="d-flex align-items-center justify-content-center"
      style="position:fixed; right:20px; bottom:28px; width:56px; height:56px; border-radius:28px; background:#0d6efd; color:#fff; border:none; box-shadow:0 6px 16px rgba(0,0,0,0.35)"
      aria-label="Add a connection"
      @click="openAddSheet"
    >
      <i class="bi bi-plus-lg" style="font-size:1.4rem"></i>
    </button>

    <!-- Add-connection sheet -->
    <div
      v-if="showAddSheet"
      style="position:fixed; inset:0; background:rgba(0,0,0,0.55); display:flex; align-items:flex-end; z-index:20"
      @click.self="showAddSheet = false"
    >
      <div class="w-100 p-4" style="background:#1a1d21; border:1px solid #2d3035; border-top-left-radius:20px; border-top-right-radius:20px">
        <div class="mx-auto mb-3" style="width:36px; height:4px; border-radius:2px; background:#495057"></div>
        <div class="text-light fw-semibold text-center mb-3" style="font-size:1.05rem">New connection</div>
        <label class="form-label text-muted" style="font-size:0.78rem">XMPP JID</label>
        <input
          v-model="newJid"
          type="text"
          class="form-control bg-dark border-secondary text-light mb-2"
          placeholder="user@xmpp.example.com"
        />
        <label class="form-label text-muted" style="font-size:0.78rem">Label <span class="text-secondary">(optional)</span></label>
        <input
          v-model="newLabel"
          type="text"
          class="form-control bg-dark border-secondary text-light mb-2"
          placeholder="e.g. MONET SAAO"
        />
        <label class="form-label text-muted" style="font-size:0.78rem">Password <span class="text-secondary">(optional)</span></label>
        <input
          v-model="newPassword"
          type="password"
          class="form-control bg-dark border-secondary text-light mb-2"
          placeholder="Leave blank to enter it later"
          autocomplete="off"
          @keydown.enter.prevent="confirmAdd"
        />
        <p class="text-muted mb-3" style="font-size:0.72rem">
          Server and VFS settings can be added after via ⋯. A saved password lets Connect skip straight in next time.
        </p>
        <button type="button" class="btn btn-primary w-100 mb-2" :disabled="!newJid.trim()" @click="confirmAdd">Add</button>
        <button type="button" class="btn btn-link w-100 text-muted" @click="showAddSheet = false">Cancel</button>
      </div>
    </div>

    <div class="text-center text-muted mt-4" style="font-size:0.68rem">v{{ appVersion }}</div>
  </div>
</template>
