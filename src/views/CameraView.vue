<script setup lang="ts">
// Phase 2 of specs/plans/camera-page.md: CameraView.vue + Expose button,
// wired to a live grab_data() call and the phase 1 FitsCanvas widget.
// Single-shot only (no IDataSequence), own-triggered images only (no
// NewImageEvent subscription) — see the plan's Phase 2 section for why.
import { ref, computed, watchEffect, type DeepReadonly } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useXmpp, type PyobsModule } from '@/composables/useXmpp'
import { useVfsConfig } from '@/composables/useVfsConfig'
import type { CommandSchema } from '@/pyobs-codec'
import ModuleStateCard from '@/components/ModuleStateCard.vue'
import FitsCanvas from '@/components/FitsCanvas.vue'

const route = useRoute()
const router = useRouter()
const { modules, executeMethod } = useXmpp()
const { resolveVfsEndpoint } = useVfsConfig()

const cameraModules = computed(() =>
  modules.value.filter((m) => 'ICamera' in m.interfaces).sort((a, b) => a.name.localeCompare(b.name)),
)

const routeJid = computed(() => route.params.jid as string | undefined)

const currentModule = computed(() =>
  routeJid.value ? cameraModules.value.find((m) => m.jid === routeJid.value) : undefined,
)

watchEffect(() => {
  if (!routeJid.value && cameraModules.value.length > 0) {
    router.replace({ name: 'camera', params: { jid: cameraModules.value[0]!.jid } })
  }
})

const exposing = ref<Record<string, boolean>>({}) // jid -> exposure in flight
const errors = ref<Record<string, string>>({}) // jid -> last error, if any
const images = ref<Record<string, Uint8Array>>({}) // jid -> last grabbed FITS bytes

async function expose(mod: DeepReadonly<PyobsModule>) {
  const schema = mod.interfaces['ICamera']?.commands['grab_data'] as CommandSchema | undefined
  if (!schema) return

  exposing.value = { ...exposing.value, [mod.jid]: true }
  errors.value = { ...errors.value, [mod.jid]: '' }
  try {
    const result = await executeMethod(mod.fullJid, 'grab_data', schema.params.map(() => null), schema)
    if (!result.success) {
      errors.value = {
        ...errors.value,
        [mod.jid]: `${result.errorClass ? `${result.errorClass}: ` : ''}${String(result.value)}`,
      }
      return
    }

    const path = String(result.value)
    const resolved = resolveVfsEndpoint(path)
    if (!resolved) {
      errors.value = {
        ...errors.value,
        [mod.jid]: `No VFS endpoint configured for "${path}" — add one in Settings.`,
      }
      return
    }

    const headers: HeadersInit = {}
    if (resolved.endpoint.username) {
      headers['Authorization'] = `Basic ${btoa(`${resolved.endpoint.username}:${resolved.endpoint.password ?? ''}`)}`
    }
    const response = await fetch(resolved.url, { headers })
    if (!response.ok) {
      errors.value = { ...errors.value, [mod.jid]: `Fetching image failed: HTTP ${response.status}` }
      return
    }
    images.value = { ...images.value, [mod.jid]: new Uint8Array(await response.arrayBuffer()) }
  } catch (e) {
    errors.value = { ...errors.value, [mod.jid]: String(e) }
  } finally {
    const next = { ...exposing.value }
    delete next[mod.jid]
    exposing.value = next
  }
}
</script>

<template>
  <div style="max-width: 800px">
    <h5 class="text-light fw-semibold mb-4">Camera</h5>

    <div v-if="cameraModules.length === 0" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      No ICamera modules online.
    </div>

    <div v-else-if="!currentModule" class="text-muted" style="font-size:0.9rem">
      <i class="bi bi-info-circle me-1"></i>
      Camera module{{ routeJid ? ` "${routeJid}"` : '' }} is not online.
    </div>

    <div v-else class="d-flex flex-column gap-2">
      <div
        :key="currentModule.jid"
        class="rounded-3 p-3"
        style="background-color:#1a1d21; border:1px solid #2d3035"
      >
        <div class="d-flex align-items-center gap-2 mb-2">
          <span class="status-dot online flex-shrink-0"></span>
          <span class="text-light fw-semibold" style="font-size:0.9rem">{{ currentModule.name }}</span>
          <span class="text-muted" style="font-size:0.75rem">{{ currentModule.jid }}</span>
        </div>

        <ModuleStateCard
          v-if="currentModule.interfaces['IExposure']"
          :jid="currentModule.jid"
          interface-name="IExposure"
          :version="currentModule.interfaces['IExposure'].version"
          title="Exposure"
        />

        <div class="d-flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="!!exposing[currentModule.jid]"
            @click="expose(currentModule)"
          >
            <span v-if="exposing[currentModule.jid]" class="spinner-border spinner-border-sm me-1" role="status"></span>
            Expose
          </button>
        </div>

        <div v-if="errors[currentModule.jid]" class="alert alert-danger py-1 px-2 mt-2 mb-0" style="font-size:0.8rem">
          {{ errors[currentModule.jid] }}
        </div>

        <FitsCanvas v-if="images[currentModule.jid]" class="mt-2" :data="images[currentModule.jid]!" />
      </div>
    </div>
  </div>
</template>
