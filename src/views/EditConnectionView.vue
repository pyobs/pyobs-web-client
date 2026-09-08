<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Strophe } from 'strophe.js'
import { useXmpp } from '@/composables/useXmpp'
import { useServerConfig } from '@/composables/useServerConfig'
import { useVfsConfig, type VfsEndpoint } from '@/composables/useVfsConfig'
import { useCredentialStore } from '@/composables/useCredentialStore'
import { useConfirmArm } from '@/composables/useConfirmArm'

const props = defineProps<{ jid: string }>()
const emit = defineEmits<{ back: []; 'save-and-connect': [jid: string] }>()

const { recentLogins, setLoginLabel, forgetLogin } = useXmpp()
const { getForceSecure, setForceSecure, getPort, setPort } = useServerConfig()
const { getPassword, setPassword, removePassword } = useCredentialStore()

const domain = computed(() => Strophe.getDomainFromJid(props.jid) ?? '')
const bareJid = computed(() => Strophe.getBareJidFromJid(props.jid) ?? props.jid)

// Local until Save/Save and connect commits it — Cancel just discards it
// (no blur-save: this screen has real "leave without saving" semantics now).
const labelInput = ref('')
watch(
  () => props.jid,
  (jid) => (labelInput.value = recentLogins.value.find((entry) => entry.jid === jid)?.label ?? ''),
  { immediate: true },
)
function commitLabel() {
  setLoginLabel(props.jid, labelInput.value.trim() || undefined)
}
function saveAndClose() {
  commitLabel()
  emit('back')
}
function saveAndConnect() {
  commitLabel()
  emit('save-and-connect', props.jid)
}

// Password field: never round-trips the actual stored secret back into the
// input (blank means "leave unchanged" while editing an existing one, not
// "no password"). hasStoredPassword drives the placeholder/copy and whether
// "Forget saved password" is shown.
const hasStoredPassword = ref(false)
const passwordInput = ref('')

async function refreshPasswordFlag() {
  hasStoredPassword.value = (await getPassword(bareJid.value)) !== null
}
watch(() => props.jid, refreshPasswordFlag, { immediate: true })

async function savePassword() {
  if (!passwordInput.value) return
  await setPassword(bareJid.value, passwordInput.value)
  passwordInput.value = ''
  await refreshPasswordFlag()
}

async function forgetSavedPassword() {
  await removePassword(bareJid.value)
  await refreshPasswordFlag()
}

const forceSecure = computed<boolean>({
  get: () => getForceSecure(domain.value) ?? true,
  set: (value) => {
    if (domain.value) setForceSecure(domain.value, value)
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

const { vfsEndpoints, addEndpoint, updateEndpoint, removeEndpoint } = useVfsConfig(props.jid)

const editingIndex = ref<number | null>(null) // -1 while adding, null while closed
const isNew = ref(false)
const form = ref<VfsEndpoint>({ root: '', baseUrl: '', token: '' })

function startAdd() {
  isNew.value = true
  editingIndex.value = -1
  form.value = { root: '', baseUrl: '', token: '' }
}

function startEdit(index: number) {
  const existing = vfsEndpoints.value[index]
  if (!existing) return
  isNew.value = false
  editingIndex.value = index
  // Token is never round-tripped back into the form — same "blank means
  // leave unchanged" pattern as the XMPP password above, now that it lives in
  // secure storage rather than plain localStorage.
  form.value = { ...existing, token: '' }
}

function cancelEdit() {
  editingIndex.value = null
}

async function save() {
  if (!form.value.root || !form.value.baseUrl) return
  const endpoint: VfsEndpoint = {
    root: form.value.root,
    baseUrl: form.value.baseUrl,
    ...(form.value.token ? { token: form.value.token } : {}),
  }
  if (isNew.value) {
    await addEndpoint(endpoint)
  } else if (editingIndex.value !== null) {
    await updateEndpoint(editingIndex.value, endpoint)
  }
  editingIndex.value = null
}

// Tap-to-arm confirmation — see #38.
const confirmArm = useConfirmArm()

function removeConnection() {
  forgetLogin(props.jid)
  removePassword(bareJid.value)
  emit('back')
}
</script>

<template>
  <div>
    <div class="mb-4">
      <div class="text-light fw-semibold text-truncate" style="font-size:1rem">{{ labelInput || jid }}</div>
      <div v-if="labelInput" class="text-muted text-truncate" style="font-size:0.78rem">{{ jid }}</div>
    </div>

    <div class="mb-4">
      <div class="text-muted mb-2" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:.06em">Label</div>
      <div class="rounded-3 p-3" style="background-color:#1a1d21; border:1px solid #2d3035">
        <input
          v-model="labelInput"
          type="text"
          class="form-control form-control-sm bg-dark border-secondary text-light mb-2"
          placeholder="e.g. My Telescope"
        />
        <div class="text-muted" style="font-size:0.75rem">Shown instead of the JID in the connections list and recent logins.</div>
      </div>
    </div>

    <div class="mb-4">
      <div class="text-muted mb-2" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:.06em">Server</div>
      <div class="rounded-3 p-3" style="background-color:#1a1d21; border:1px solid #2d3035">
        <div class="d-flex align-items-center justify-content-between form-check form-switch mb-0">
          <div>
            <label class="text-light" for="editForceSecureWs" style="font-size:0.9rem">Secure WebSocket (wss)</label>
            <div class="text-muted" style="font-size:0.75rem">Applies to every account on {{ domain }}</div>
          </div>
          <input id="editForceSecureWs" v-model="forceSecure" type="checkbox" class="form-check-input flex-shrink-0" role="switch" />
        </div>

        <hr class="border-secondary-subtle my-3" />

        <label class="text-light" for="editWsPort" style="font-size:0.9rem">WebSocket port <span class="text-secondary">(optional)</span></label>
        <input
          id="editWsPort"
          v-model="portInput"
          type="text"
          inputmode="numeric"
          class="form-control form-control-sm bg-dark border-secondary text-light mt-1"
          placeholder="default (443/80)"
        />
        <div class="text-muted mt-1" style="font-size:0.75rem">Leave blank to use the default port for ws/wss.</div>
      </div>
    </div>

    <div class="mb-4">
      <div class="text-muted mb-2" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:.06em">Password</div>
      <div class="rounded-3 p-3" style="background-color:#1a1d21; border:1px solid #2d3035">
        <input
          v-model="passwordInput"
          type="password"
          class="form-control form-control-sm bg-dark border-secondary text-light mb-2"
          :placeholder="hasStoredPassword ? '•••••••• (leave blank to keep it)' : 'Not saved — enter to remember it'"
          autocomplete="off"
        />
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-primary btn-sm" :disabled="!passwordInput" @click="savePassword">Save password</button>
          <button v-if="hasStoredPassword" type="button" class="btn btn-outline-secondary btn-sm" @click="forgetSavedPassword">Forget saved password</button>
        </div>
      </div>
    </div>

    <div class="mb-4">
      <div class="d-flex align-items-center gap-2 mb-2">
        <div class="text-muted" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:.06em">VFS endpoints</div>
        <button type="button" class="btn btn-outline-secondary btn-sm ms-auto" @click="startAdd">
          <i class="bi bi-plus-lg me-1"></i>Add
        </button>
      </div>

      <p v-if="vfsEndpoints.length === 0 && editingIndex === null" class="text-muted" style="font-size:0.85rem">
        No VFS endpoints configured for this connection yet.
      </p>

      <div
        v-for="(endpoint, index) in vfsEndpoints"
        :key="endpoint.root"
        class="rounded-3 p-3 mb-2"
        style="background-color:#1a1d21; border:1px solid #2d3035"
      >
        <div class="d-flex align-items-start gap-2">
          <div class="flex-grow-1">
            <div class="text-light fw-semibold" style="font-size:0.9rem">{{ endpoint.root }}</div>
            <div class="text-muted text-break" style="font-size:0.75rem">{{ endpoint.baseUrl }}</div>
          </div>
          <button class="btn btn-outline-secondary btn-sm" @click="startEdit(index)"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm" @click="removeEndpoint(index)"><i class="bi bi-trash"></i></button>
        </div>
      </div>

      <div v-if="editingIndex !== null" class="rounded-3 p-3 mt-2" style="background-color:#1a1d21; border:1px solid #2d3035">
        <div class="mb-2">
          <label class="form-label mb-1 text-muted" style="font-size:0.8rem">Root name</label>
          <input v-model="form.root" type="text" class="form-control form-control-sm bg-dark border-secondary text-light" placeholder="pyobs" />
        </div>
        <div class="mb-2">
          <label class="form-label mb-1 text-muted" style="font-size:0.8rem">Base URL</label>
          <input v-model="form.baseUrl" type="text" class="form-control form-control-sm bg-dark border-secondary text-light" placeholder="https://archive.example.com/pyobs/" />
        </div>
        <div class="mb-3">
          <label class="form-label mb-1 text-muted" style="font-size:0.8rem">Token <span class="text-secondary">(optional)</span></label>
          <input
            v-model="form.token"
            type="password"
            class="form-control form-control-sm bg-dark border-secondary text-light"
            :placeholder="isNew ? '' : 'leave blank to keep unchanged'"
            autocomplete="off"
          />
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm" :disabled="!form.root || !form.baseUrl" @click="save">Save</button>
          <button class="btn btn-outline-secondary btn-sm" @click="cancelEdit">Cancel</button>
        </div>
      </div>
    </div>

    <div class="d-flex gap-2 mb-2">
      <button type="button" class="btn btn-outline-secondary flex-fill" @click="saveAndClose">Save</button>
      <button type="button" class="btn btn-primary flex-fill" @click="saveAndConnect">Save and connect</button>
    </div>
    <button type="button" class="btn btn-link w-100 text-muted mb-4" @click="emit('back')">Cancel</button>

    <button
      type="button"
      class="btn w-100 d-flex align-items-center justify-content-center gap-2"
      :style="
        confirmArm.isArmed('remove')
          ? 'height:48px; border-radius:12px; border:1px solid #dc3545; background:#dc354520; color:#ff8f8f'
          : 'height:48px; border-radius:12px; border:1px solid #dc354540; color:#ff8f8f'
      "
      @click="confirmArm.confirm('remove') && removeConnection()"
    >
      <i class="bi bi-trash"></i>
      {{ confirmArm.isArmed('remove') ? 'Confirm remove?' : 'Remove connection' }}
    </button>
  </div>
</template>
