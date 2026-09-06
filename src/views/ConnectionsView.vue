<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Strophe } from 'strophe.js'
import { useXmpp } from '@/composables/useXmpp'
import { useServerConfig } from '@/composables/useServerConfig'
import { useVfsConfig, type VfsEndpoint } from '@/composables/useVfsConfig'
import { useCredentialStore } from '@/composables/useCredentialStore'

// Offline-usable connection manager: saved JIDs (recentLogins, but addable
// without ever connecting), each with its per-domain WS-secure override
// (useServerConfig, already offline-capable) and its own VFS endpoints
// (useVfsConfig, normally keyed by the *live* session's JID — here keyed by
// whichever saved connection is expanded instead, via its overrideBareJid
// param). Nothing on this screen requires a network connection.
//
// Not a router route: this app doesn't route anything before login (App.vue
// hardcodes LoginView until connected; RouterView only exists inside the
// post-login AppLayout) — LoginView toggles to this component locally,
// matching that existing pattern instead of fighting it.

const emit = defineEmits<{ connect: [jid: string]; back: [] }>()

const { recentLogins, rememberLogin, forgetLogin } = useXmpp()
const { getForceSecure, setForceSecure } = useServerConfig()
const { getPassword, removePassword } = useCredentialStore()

const newJid = ref('')

function bareJidOf(jid: string): string {
  return Strophe.getBareJidFromJid(jid) ?? jid
}

// Which saved connections have a remembered password — checked async since
// the secure-storage plugin is promise-based; re-checked whenever the saved
// list changes (e.g. after a successful "remember password" login elsewhere).
const jidsWithSavedPassword = ref<Set<string>>(new Set())

async function refreshPasswordFlags() {
  const flags = await Promise.all(
    recentLogins.value.map(async (j) => [j, (await getPassword(bareJidOf(j))) !== null] as const),
  )
  jidsWithSavedPassword.value = new Set(flags.filter(([, has]) => has).map(([j]) => j))
}

watch(recentLogins, refreshPasswordFlags, { immediate: true })

function addConnection() {
  const j = newJid.value.trim()
  if (!j) return
  rememberLogin(j)
  newJid.value = ''
}

function removeConnection(jid: string) {
  if (expandedJid.value === jid) expandedJid.value = null
  forgetLogin(jid)
  removePassword(bareJidOf(jid))
}

function forgetPassword(jid: string) {
  removePassword(bareJidOf(jid)).then(refreshPasswordFlags)
}

function connectTo(jid: string) {
  emit('connect', jid)
}

function domainOf(jid: string): string {
  return Strophe.getDomainFromJid(jid) ?? ''
}

function forceSecureFor(jid: string): boolean {
  return getForceSecure(domainOf(jid)) ?? true
}

function setForceSecureFor(jid: string, value: boolean) {
  const d = domainOf(jid)
  if (d) setForceSecure(d, value)
}

// One connection's VFS endpoints expanded/edited at a time, accordion-style,
// to keep the list itself scannable when there are several saved logins.
const expandedJid = ref<string | null>(null)
const vfs = computed(() => (expandedJid.value ? useVfsConfig(expandedJid.value) : null))

function toggleExpand(jid: string) {
  editingIndex.value = null
  expandedJid.value = expandedJid.value === jid ? null : jid
}

const editingIndex = ref<number | null>(null) // -1 while adding, null while closed
const isNewEndpoint = ref(false)
const form = ref<VfsEndpoint>({ root: '', baseUrl: '', username: '', password: '' })

function startAddEndpoint() {
  isNewEndpoint.value = true
  editingIndex.value = -1
  form.value = { root: '', baseUrl: '', username: '', password: '' }
}

function startEditEndpoint(index: number) {
  const existing = vfs.value?.vfsEndpoints.value[index]
  if (!existing) return
  isNewEndpoint.value = false
  editingIndex.value = index
  form.value = { ...existing }
}

function cancelEndpoint() {
  editingIndex.value = null
}

function saveEndpoint() {
  if (!vfs.value || !form.value.root || !form.value.baseUrl) return
  const endpoint: VfsEndpoint = {
    root: form.value.root,
    baseUrl: form.value.baseUrl,
    ...(form.value.username ? { username: form.value.username } : {}),
    ...(form.value.password ? { password: form.value.password } : {}),
  }
  if (isNewEndpoint.value) {
    vfs.value.addEndpoint(endpoint)
  } else if (editingIndex.value !== null) {
    vfs.value.updateEndpoint(editingIndex.value, endpoint)
  }
  editingIndex.value = null
}
</script>

<template>
  <div style="max-width: 480px; margin: 0 auto">
    <div class="d-flex align-items-center gap-3 mb-3">
      <h5 class="text-light fw-semibold mb-0">Connections</h5>
      <button type="button" class="btn btn-outline-secondary btn-sm ms-auto" @click="emit('back')">
        <i class="bi bi-arrow-left me-1"></i>Back to login
      </button>
    </div>

    <p class="text-muted mb-3" style="font-size:0.8rem">
      Saved connections work offline — add, edit, or remove them without a live server.
    </p>

    <p v-if="recentLogins.length === 0" class="text-muted" style="font-size:0.85rem">
      <i class="bi bi-info-circle me-1"></i>
      No saved connections yet.
    </p>

    <div
      v-for="loginJid in recentLogins"
      :key="loginJid"
      class="rounded-3 p-3 mb-2"
      style="background-color:#1a1d21; border:1px solid #2d3035"
    >
      <div class="d-flex align-items-center gap-2">
        <div class="flex-grow-1 text-break" style="font-size:0.85rem">
          <span class="text-light">{{ loginJid }}</span>
          <i v-if="jidsWithSavedPassword.has(loginJid)" class="bi bi-lock-fill text-secondary ms-1" title="Password remembered on this device"></i>
        </div>
        <button class="btn btn-outline-secondary btn-sm" :title="expandedJid === loginJid ? 'Hide VFS endpoints' : 'Edit VFS endpoints'" @click="toggleExpand(loginJid)">
          <i class="bi" :class="expandedJid === loginJid ? 'bi-chevron-up' : 'bi-gear'"></i>
        </button>
        <button class="btn btn-outline-danger btn-sm" title="Remove" @click="removeConnection(loginJid)">
          <i class="bi bi-trash"></i>
        </button>
        <button class="btn btn-primary btn-sm" @click="connectTo(loginJid)">Connect</button>
      </div>

      <div v-if="jidsWithSavedPassword.has(loginJid)" class="mt-1">
        <button class="btn btn-link btn-sm p-0 text-muted" style="font-size:0.75rem" @click="forgetPassword(loginJid)">
          Forget saved password
        </button>
      </div>

      <div class="form-check form-switch mt-2 mb-0">
        <input
          :id="`secure-${loginJid}`"
          class="form-check-input"
          type="checkbox"
          role="switch"
          :checked="forceSecureFor(loginJid)"
          @change="setForceSecureFor(loginJid, ($event.target as HTMLInputElement).checked)"
        />
        <label class="form-check-label text-muted" :for="`secure-${loginJid}`" style="font-size:0.8rem">
          Use secure WebSocket (wss) for {{ domainOf(loginJid) }}
        </label>
      </div>

      <div v-if="expandedJid === loginJid" class="mt-3 pt-3" style="border-top: 1px solid #2d3035">
        <div class="d-flex align-items-center gap-2 mb-2">
          <div class="text-muted" style="font-size:0.75rem; text-transform:uppercase; letter-spacing:.06em">VFS endpoints</div>
          <button class="btn btn-outline-secondary btn-sm ms-auto" @click="startAddEndpoint">
            <i class="bi bi-plus-lg me-1"></i>Add
          </button>
        </div>

        <p v-if="vfs && vfs.vfsEndpoints.value.length === 0 && editingIndex === null" class="text-muted" style="font-size:0.8rem">
          No VFS endpoints configured for this connection yet.
        </p>

        <div
          v-for="(endpoint, index) in vfs?.vfsEndpoints.value ?? []"
          :key="endpoint.root"
          class="rounded-3 p-2 mb-2"
          style="background-color:#111316; border:1px solid #2d3035"
        >
          <div class="d-flex align-items-start gap-2">
            <div class="flex-grow-1">
              <div class="text-light" style="font-size:0.8rem">{{ endpoint.root }}</div>
              <div class="text-muted text-break" style="font-size:0.7rem">{{ endpoint.baseUrl }}</div>
            </div>
            <button class="btn btn-outline-secondary btn-sm" @click="startEditEndpoint(index)">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-outline-danger btn-sm" @click="vfs?.removeEndpoint(index)">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>

        <div
          v-if="editingIndex !== null"
          class="rounded-3 p-2 mt-2"
          style="background-color:#111316; border:1px solid #2d3035"
        >
          <div class="mb-2">
            <label class="form-label mb-1 text-muted" style="font-size:0.75rem">Root name</label>
            <input v-model="form.root" type="text" class="form-control form-control-sm bg-dark border-secondary text-light" placeholder="pyobs" />
          </div>
          <div class="mb-2">
            <label class="form-label mb-1 text-muted" style="font-size:0.75rem">Base URL</label>
            <input v-model="form.baseUrl" type="text" class="form-control form-control-sm bg-dark border-secondary text-light" placeholder="https://archive.example.com/pyobs/" />
          </div>
          <div class="mb-2">
            <label class="form-label mb-1 text-muted" style="font-size:0.75rem">Username <span class="text-secondary">(optional)</span></label>
            <input v-model="form.username" type="text" class="form-control form-control-sm bg-dark border-secondary text-light" autocomplete="off" />
          </div>
          <div class="mb-2">
            <label class="form-label mb-1 text-muted" style="font-size:0.75rem">Password <span class="text-secondary">(optional)</span></label>
            <input v-model="form.password" type="password" class="form-control form-control-sm bg-dark border-secondary text-light" autocomplete="off" />
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-primary btn-sm" :disabled="!form.root || !form.baseUrl" @click="saveEndpoint">Save</button>
            <button class="btn btn-outline-secondary btn-sm" @click="cancelEndpoint">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-3 p-3 mt-3" style="background-color:#1a1d21; border:1px solid #2d3035">
      <label class="form-label mb-1 text-muted" style="font-size:0.8rem">Add a connection</label>
      <div class="d-flex gap-2">
        <input
          v-model="newJid"
          type="text"
          class="form-control form-control-sm bg-dark border-secondary text-light"
          placeholder="user@xmpp.example.com"
          @keydown.enter.prevent="addConnection"
        />
        <button class="btn btn-primary btn-sm" :disabled="!newJid.trim()" @click="addConnection">Add</button>
      </div>
      <p class="text-muted mb-0 mt-2" style="font-size:0.75rem">
        Saves the JID so its server/VFS settings can be configured before you ever connect.
        The password is still entered fresh on the login screen.
      </p>
    </div>
  </div>
</template>
