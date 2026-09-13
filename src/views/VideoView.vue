<script setup lang="ts">
// IVideo — Live View tab. See pyobs_gui/videowidget.py and
// specs/plans/2026-09-07-video-widget.md. pyobs-gui hand-parses a raw MJPEG
// socket because Qt has no native decoder; a browser's <img> tag plays an
// MJPEG multipart stream natively, so this widget is just VFS-resolving the
// stream URL and pointing an <img> at it — no socket/parsing code needed.
import { ref, computed, watch, onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import { useVfsConfig } from '@/composables/useVfsConfig'
import { isMethodPermitted, NOT_PERMITTED_TITLE } from '@/utils/acl'
import type { CommandSchema } from '@/pyobs-codec'

const props = defineProps<{ jid: string }>()
const { modules, executeMethod, subscribeState } = useXmpp()
const { resolveVfsEndpoint } = useVfsConfig()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))

function permitted(method: string): boolean {
  return isMethodPermitted(currentModule.value?.permittedMethods, method)
}

// ── Stream URL — resolved once per module, not re-fetched on every render.
// videowidget.py's own open-VFS-path/find-HttpFile logic, minus the
// raw-socket bit an <img> tag makes unnecessary.
const streamUrl = ref<string | undefined>(undefined)
const streamTokenProtected = ref(false)
const streamError = ref('')

// ── Bearer-token auth for the <img>-tag stream ──────────────────────────────
// An <img> tag's src can't carry a custom Authorization header, but
// pyobs.modules.camera.BaseVideo (2026-09-13) already has the fix for that: a
// same-origin, HMAC-signed session cookie a browser gets by visiting /login
// once (GET for the form, POST {token} to log in) — see
// testing/pyobs-gui-configs/xmpp/video_token.yaml and this plan's Status line.
// The catch: BaseVideo's HTTP server sends no CORS headers at all, so a plain
// fetch() to /login is blocked outright; a hidden <form>/<iframe> POST isn't
// CORS-gated (forms never have been — that's how CSRF worked before tokens),
// so that's what logInIframe/logInForm below drive. And the resulting cookie
// is SameSite=Lax, which browsers refuse to attach to a genuinely cross-SITE
// <img> request — only same-site (registrable domain) or same-host requests
// get it. Comparing full eTLD+1 needs the public suffix list, which this repo
// doesn't carry; comparing exact hostnames instead is conservative (some
// legitimately same-site, different-subdomain deployments will be told "not
// supported" that could actually work) but never wrongly claims a genuinely
// cross-site stream will authenticate. Verified live against a real Chrome
// tab: a hidden-iframe form POST across two localhost ports (same host,
// different origin) does make the following <img> request carry the cookie.
const loginIframe = ref<HTMLIFrameElement>()
const loginForm = ref<HTMLFormElement>()
const loginTokenInput = ref<HTMLInputElement>()

function isSameHost(url: string): boolean {
  try {
    return new URL(url).hostname === window.location.hostname
  } catch {
    return false
  }
}

// Resolves once the hidden iframe finishes loading the /login response (a 303
// redirect to / on success, a 401 page on a wrong token — either way a
// completed navigation, so `load` fires regardless of outcome). Wrong-token
// failures surface via the <img>'s own @error handler below instead of here.
function loginForStream(baseUrl: string, token: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = loginIframe.value
    const form = loginForm.value
    const input = loginTokenInput.value
    if (!iframe || !form || !input) {
      resolve()
      return
    }
    iframe.onload = () => resolve()
    form.action = new URL('/login', baseUrl).toString()
    input.value = token
    form.submit()
  })
}

watch(
  currentModule,
  async (mod) => {
    streamUrl.value = undefined
    streamTokenProtected.value = false
    streamError.value = ''

    if (!mod) return

    // Distinguish "hasn't published capabilities at all" from "published them,
    // but this module has no mjpeg stream" from "VFS not configured" — these
    // used to collapse into one generic "No video stream available", which
    // made a real capabilities-publishing bug (see #39) indistinguishable
    // from a module that genuinely doesn't support a live stream.
    const videoCaps = mod.capabilities['IVideo'] as { mjpeg?: string | null } | undefined
    if (!videoCaps) {
      streamError.value = "This module hasn't published its IVideo capabilities yet."
      return
    }
    const mjpegPath = videoCaps.mjpeg ?? null
    if (!mjpegPath) {
      streamError.value = 'This module does not support a live MJPEG stream.'
      return
    }

    const resolved = await resolveVfsEndpoint(mjpegPath)
    if (!resolved) {
      streamError.value = `No VFS endpoint configured for "${mjpegPath}" — add one in Settings.`
      return
    }
    if (resolved.endpoint.token) {
      if (!isSameHost(resolved.url)) {
        streamTokenProtected.value = true
        return
      }
      await loginForStream(resolved.url, resolved.endpoint.token)
    }
    streamUrl.value = resolved.url
  },
  { immediate: true },
)

// Covers both a wrong token (cookie login silently failed above) and any
// other stream-load failure (network blip, module gone) — previously nothing
// surfaced this at all, just a broken-image icon.
const streamLoadError = ref(false)
function onStreamError() {
  streamLoadError.value = true
}
watch(streamUrl, () => (streamLoadError.value = false))

// ── IExposureTime / IGain — shown only when the module implements them,
// matching groupExposure/groupGain's visibility toggle in videowidget.py.

type ExposureTimeState = { exposure_time: number }
type GainState = { gain: number }

const exposureTimeStateValue = ref<ExposureTimeState | undefined>(undefined)
const gainStateValue = ref<GainState | undefined>(undefined)
let stopSubscription: (() => void) | undefined

watch(
  currentModule,
  (mod) => {
    stopSubscription?.()
    stopSubscription = undefined
    exposureTimeStateValue.value = undefined
    gainStateValue.value = undefined

    if (!mod) return
    const stops: (() => void)[] = []

    const expVersion = mod.interfaces['IExposureTime']?.version
    if (expVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IExposureTime', expVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (exposureTimeStateValue.value = v as ExposureTimeState | undefined), { immediate: true }))
    }

    const gainVersion = mod.interfaces['IGain']?.version
    if (gainVersion !== undefined) {
      const { value, unsubscribe } = subscribeState(mod.jid, 'IGain', gainVersion)
      stops.push(unsubscribe)
      stops.push(watch(value, (v) => (gainStateValue.value = v as GainState | undefined), { immediate: true }))
    }

    stopSubscription = () => stops.forEach((stop) => stop())
  },
  { immediate: true },
)

onUnmounted(() => stopSubscription?.())

// Seeded once on first arrival, not re-synced on every push — this app's own
// established precedent (CoolingView.vue etc.) over videowidget.py's literal
// behavior of re-applying the spinbox value (and re-sending it) on every
// state push, which doesn't fit an explicit-Apply mobile form.
const exposureTimeInput = ref(0)
const gainInput = ref(0)
const exposureTimeSeeded = ref(false)
const gainSeeded = ref(false)

watch(exposureTimeStateValue, (state) => {
  if (!state || exposureTimeSeeded.value) return
  exposureTimeInput.value = state.exposure_time
  exposureTimeSeeded.value = true
})
watch(gainStateValue, (state) => {
  if (!state || gainSeeded.value) return
  gainInput.value = state.gain
  gainSeeded.value = true
})

const exposureTimeError = ref('')
const gainError = ref('')

async function setExposureTime() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IExposureTime']?.commands['set_exposure_time'] as CommandSchema | undefined
  if (!schema) return
  exposureTimeError.value = ''
  const res = await executeMethod(mod.fullJid, 'set_exposure_time', [exposureTimeInput.value], schema)
  if (!res.success) exposureTimeError.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
}

async function setGain() {
  const mod = currentModule.value
  if (!mod) return
  const schema = mod.interfaces['IGain']?.commands['set_gain'] as CommandSchema | undefined
  if (!schema) return
  gainError.value = ''
  const res = await executeMethod(mod.fullJid, 'set_gain', [gainInput.value], schema)
  if (!res.success) gainError.value = `${res.errorClass ? `${res.errorClass}: ` : ''}${String(res.value)}`
}
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <!-- Hidden — see loginForStream() above. Not user-visible, just the
         auth handshake an <img> tag can't do on its own. -->
    <iframe ref="loginIframe" name="pyobs-video-login" style="display:none" aria-hidden="true"></iframe>
    <form ref="loginForm" target="pyobs-video-login" method="post" style="display:none">
      <input ref="loginTokenInput" type="hidden" name="token" />
    </form>

    <div class="pyobs-card p-0" style="overflow:hidden">
      <img
        v-if="streamUrl"
        :src="streamUrl"
        alt="Live view"
        style="display:block; width:100%; height:auto"
        @error="onStreamError"
      />
      <div v-if="streamUrl && streamLoadError" class="text-danger p-3" style="font-size:0.85rem">
        Couldn't load the stream — if it's token-protected, check the VFS endpoint token in
        Settings matches the module's own.
      </div>
      <div v-else-if="streamTokenProtected" class="text-muted p-3" style="font-size:0.85rem">
        This stream's VFS endpoint requires a bearer token, and the module isn't on this app's own
        host — a browser won't carry the resulting login cookie across sites, so live view isn't
        supported for this connection.
      </div>
      <div v-else-if="streamError" class="text-muted p-3" style="font-size:0.85rem">{{ streamError }}</div>
      <div v-else-if="!streamUrl" class="text-muted p-3" style="font-size:0.85rem">No video stream available.</div>
    </div>

    <div v-if="exposureTimeStateValue !== undefined" class="d-flex gap-2 align-items-end">
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Exposure time (s)</label>
        <input v-model.number="exposureTimeInput" type="number" step="any" min="0" class="form-control form-control-sm" />
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!permitted('set_exposure_time')"
        :title="permitted('set_exposure_time') ? undefined : NOT_PERMITTED_TITLE"
        @click="setExposureTime"
      >
        Set
      </button>
    </div>
    <div v-if="exposureTimeError" class="alert alert-danger py-1 px-2 mb-0" style="font-size:0.8rem">{{ exposureTimeError }}</div>

    <div v-if="gainStateValue !== undefined" class="d-flex gap-2 align-items-end">
      <div class="flex-fill">
        <label class="text-muted d-block" style="font-size:0.7rem">Gain</label>
        <input v-model.number="gainInput" type="number" step="any" class="form-control form-control-sm" />
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="!permitted('set_gain')"
        :title="permitted('set_gain') ? undefined : NOT_PERMITTED_TITLE"
        @click="setGain"
      >
        Set
      </button>
    </div>
    <div v-if="gainError" class="alert alert-danger py-1 px-2 mb-0" style="font-size:0.8rem">{{ gainError }}</div>
  </div>
</template>
