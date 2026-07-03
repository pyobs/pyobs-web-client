<script setup lang="ts">
import { ref } from 'vue'
import { useVfsConfig, type VfsEndpoint } from '@/composables/useVfsConfig'

const { vfsEndpoints, addEndpoint, updateEndpoint, removeEndpoint } = useVfsConfig()

const editingIndex = ref<number | null>(null) // null while the form is closed
const isNew = ref(false)
const form = ref<VfsEndpoint>({ root: '', baseUrl: '', username: '', password: '' })

function startAdd() {
  isNew.value = true
  editingIndex.value = -1
  form.value = { root: '', baseUrl: '', username: '', password: '' }
}

function startEdit(index: number) {
  const existing = vfsEndpoints.value[index]
  if (!existing) return
  isNew.value = false
  editingIndex.value = index
  form.value = { ...existing }
}

function cancel() {
  editingIndex.value = null
}

function save() {
  if (!form.value.root || !form.value.baseUrl) return
  const endpoint: VfsEndpoint = {
    root: form.value.root,
    baseUrl: form.value.baseUrl,
    ...(form.value.username ? { username: form.value.username } : {}),
    ...(form.value.password ? { password: form.value.password } : {}),
  }
  if (isNew.value) {
    addEndpoint(endpoint)
  } else if (editingIndex.value !== null) {
    updateEndpoint(editingIndex.value, endpoint)
  }
  editingIndex.value = null
}
</script>

<template>
  <div>
    <h5 class="text-light fw-semibold mb-4">Settings</h5>

    <div class="d-flex align-items-center gap-3 mb-3">
      <h6 class="text-light mb-0" style="font-size:0.9rem">VFS Endpoints</h6>
      <button class="btn btn-outline-secondary btn-sm ms-auto" @click="startAdd">
        <i class="bi bi-plus-lg me-1"></i>Add endpoint
      </button>
    </div>

    <p class="text-muted mb-3" style="font-size:0.8rem">
      Maps a VFS root name (the first path segment of paths like
      <code>pyobs/2024/07/03/image.fits.gz</code>, e.g. returned by
      <code>grab_data()</code>) to an HTTP base URL this browser can fetch directly.
    </p>

    <p v-if="vfsEndpoints.length === 0 && editingIndex === null" class="text-muted" style="font-size:0.85rem">
      <i class="bi bi-info-circle me-1"></i>
      No VFS endpoints configured yet.
    </p>

    <div
      v-for="(endpoint, index) in vfsEndpoints"
      :key="endpoint.root"
      class="rounded-3 p-3 mb-2"
      style="background-color:#1a1d21; border:1px solid #2d3035"
    >
      <div class="d-flex align-items-start gap-2">
        <div class="flex-grow-1">
          <div class="text-light fw-semibold" style="font-size:0.85rem">{{ endpoint.root }}</div>
          <div class="text-muted text-break" style="font-size:0.75rem">{{ endpoint.baseUrl }}</div>
          <div v-if="endpoint.username" class="text-secondary" style="font-size:0.75rem">
            user: {{ endpoint.username }}, password: ••••••
          </div>
        </div>
        <button class="btn btn-outline-secondary btn-sm" @click="startEdit(index)">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-outline-danger btn-sm" @click="removeEndpoint(index)">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </div>

    <!-- Add/edit form: stacked label-then-input, same mobile-friendly pattern as Shell's param inputs -->
    <div
      v-if="editingIndex !== null"
      class="rounded-3 p-3 mt-3"
      style="background-color:#1a1d21; border:1px solid #2d3035"
    >
      <div class="mb-2">
        <label class="form-label mb-1 text-muted" style="font-size:0.8rem">Root name</label>
        <input v-model="form.root" type="text" class="form-control form-control-sm bg-dark border-secondary text-light" placeholder="pyobs" />
      </div>
      <div class="mb-2">
        <label class="form-label mb-1 text-muted" style="font-size:0.8rem">Base URL</label>
        <input v-model="form.baseUrl" type="text" class="form-control form-control-sm bg-dark border-secondary text-light" placeholder="https://archive.example.com/pyobs/" />
      </div>
      <div class="mb-2">
        <label class="form-label mb-1 text-muted" style="font-size:0.8rem">Username <span class="text-secondary">(optional)</span></label>
        <input v-model="form.username" type="text" class="form-control form-control-sm bg-dark border-secondary text-light" autocomplete="off" />
      </div>
      <div class="mb-3">
        <label class="form-label mb-1 text-muted" style="font-size:0.8rem">Password <span class="text-secondary">(optional)</span></label>
        <input v-model="form.password" type="password" class="form-control form-control-sm bg-dark border-secondary text-light" autocomplete="off" />
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-primary btn-sm" :disabled="!form.root || !form.baseUrl" @click="save">Save</button>
        <button class="btn btn-outline-secondary btn-sm" @click="cancel">Cancel</button>
      </div>
    </div>
  </div>
</template>
