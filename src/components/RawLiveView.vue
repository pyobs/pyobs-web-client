<script setup lang="ts">
// Raw ("full quality") live view: reads /video.raw (pyobs-core BaseVideo >= 2.13.0) with a streamed
// fetch(), stretches every frame in the browser onto a canvas. Stretch and cuts change live, with no
// reconnect. See specs/plans/2026-10-04-video-live-view-modes.md (phase b) and
// specs/adrs/0002-raw-live-view-needs-basevideo-cors.md.
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { RawFrameParser, type RawFrame } from '@/utils/rawFrameParser'
import { stretchToRgba } from '@/utils/stretch'
import {
  STRETCH_FUNCTIONS,
  CUTS_MODES,
  DEFAULT_PERCENTILES,
  defaultRawSettings,
  loadRawSettings,
  saveRawSettings,
  validateCuts,
  type RawSettings,
} from '@/composables/useVideoSettings'

const props = defineProps<{ jid: string; url: string; token?: string }>()

const canvas = ref<HTMLCanvasElement>()
const status = ref<'connecting' | 'streaming' | 'error'>('connecting')
const errorText = ref('')
const frameInfo = ref('')
const colourNotice = ref(false)

const settings = ref<RawSettings>(defaultRawSettings())
const settingsError = computed(() => validateCuts(settings.value))
const showsCutValues = computed(() => settings.value.cuts === 'percentile' || settings.value.cuts === 'manual')

watch(
  () => props.jid,
  (jid) => {
    settings.value = loadRawSettings(jid)
  },
  { immediate: true },
)

function onNumberInput(key: 'lo' | 'hi', e: Event) {
  const v = (e.target as HTMLInputElement).valueAsNumber
  settings.value = { ...settings.value, [key]: Number.isFinite(v) ? v : undefined }
}

function resetSettings() {
  settings.value = defaultRawSettings()
}

// ── Rendering ────────────────────────────────────────────────────────────────
// Only the newest frame is drawn: frames that arrive between two animation frames are dropped
// (the server does the same for slow consumers), so a slow stretch can't build a backlog.
let latest: RawFrame | undefined
let imageData: ImageData | undefined
let raf = 0

function scheduleRender() {
  if (!raf) raf = requestAnimationFrame(render)
}

function render() {
  raf = 0
  const frame = latest
  const el = canvas.value
  if (!frame || !el || settingsError.value) return
  if (frame.colour) {
    colourNotice.value = true
    return
  }
  colourNotice.value = false
  if (el.width !== frame.width || el.height !== frame.height) {
    el.width = frame.width
    el.height = frame.height
    imageData = undefined
  }
  const ctx = el.getContext('2d')
  if (!ctx) return
  imageData ??= ctx.createImageData(frame.width, frame.height)
  const [low, high] = stretchToRgba(
    frame.data,
    frame.width,
    frame.height,
    settings.value,
    frame.meta.SRCDTYPE ?? frame.meta.DTYPE,
    imageData.data,
  )
  ctx.putImageData(imageData, 0, 0)
  const num = frame.meta.VIDFRAME !== undefined ? `frame ${frame.meta.VIDFRAME}, ` : ''
  frameInfo.value = `${num}${frame.width}x${frame.height}, cuts ${Math.round(low)} to ${Math.round(high)}`
}

// A settings change re-stretches the frame already in hand, and is remembered per camera.
watch(
  settings,
  (next) => {
    if (!validateCuts(next)) saveRawSettings(props.jid, next)
    scheduleRender()
  },
  { deep: true },
)

// ── Stream ───────────────────────────────────────────────────────────────────
let abort: AbortController | undefined

function explain(e: unknown): string {
  if (e instanceof TypeError) {
    // fetch() reports CORS rejections, DNS and refused connections all as the same TypeError.
    return (
      "Couldn't open the raw stream. If the camera runs on a different origin than this app, its " +
      'BaseVideo module has to allow cross-origin requests (CORS), which current pyobs-core does ' +
      'not do yet. Otherwise check that the module is reachable.'
    )
  }
  return e instanceof Error ? e.message : String(e)
}

async function start() {
  stop()
  const controller = new AbortController()
  abort = controller
  status.value = 'connecting'
  errorText.value = ''
  frameInfo.value = ''
  latest = undefined
  imageData = undefined
  try {
    const res = await fetch(props.url, {
      headers: props.token ? { Authorization: `Bearer ${props.token}` } : {},
      signal: controller.signal,
    })
    if (res.status === 401 || res.status === 403) {
      throw new Error("The module rejected the VFS endpoint token, check it in Settings matches the module's own.")
    }
    if (!res.ok || !res.body) throw new Error(`The module answered HTTP ${res.status}.`)

    const parser = new RawFrameParser()
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const frames = parser.push(value)
      if (frames.length > 0) {
        latest = frames[frames.length - 1]
        status.value = 'streaming'
        scheduleRender()
      }
    }
    if (!controller.signal.aborted) throw new Error('The stream ended.')
  } catch (e) {
    if (controller.signal.aborted) return
    status.value = 'error'
    errorText.value = explain(e)
  }
}

function stop() {
  abort?.abort()
  abort = undefined
}

watch(() => [props.url, props.token], start, { immediate: true })

onBeforeUnmount(() => {
  stop()
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="pyobs-card p-0" style="overflow:hidden">
      <canvas
        v-show="status === 'streaming' && !colourNotice"
        ref="canvas"
        style="display:block; width:100%; height:auto"
        data-testid="raw-canvas"
      ></canvas>
      <div v-if="status === 'connecting'" class="text-muted p-3" style="font-size:0.85rem">Connecting...</div>
      <div v-else-if="status === 'error'" class="text-danger p-3" style="font-size:0.85rem">
        {{ errorText }}
        <div class="mt-2">
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="start">Retry</button>
        </div>
      </div>
      <div v-else-if="colourNotice" class="text-muted p-3" style="font-size:0.85rem">
        This camera sends colour frames, which the raw view doesn't display yet. Use the low bandwidth
        (MJPEG) mode.
      </div>
      <div v-if="status === 'streaming' && frameInfo" class="text-muted px-2 py-1" style="font-size:0.7rem">
        {{ frameInfo }}
      </div>
    </div>

    <div class="pyobs-card" data-testid="raw-controls">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <span class="text-muted" style="font-size:0.7rem">Display (in browser)</span>
        <button type="button" class="btn btn-link btn-sm p-0" style="font-size:0.75rem" @click="resetSettings">
          Reset
        </button>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <div class="flex-fill" style="min-width:8rem">
          <label class="text-muted d-block" style="font-size:0.7rem">Stretch</label>
          <select v-model="settings.stretch" class="form-select form-select-sm" data-testid="raw-stretch">
            <option v-for="f in STRETCH_FUNCTIONS" :key="f" :value="f">{{ f }}</option>
          </select>
        </div>
        <div class="flex-fill" style="min-width:8rem">
          <label class="text-muted d-block" style="font-size:0.7rem">Cuts</label>
          <select v-model="settings.cuts" class="form-select form-select-sm" data-testid="raw-cuts">
            <option value="">Automatic</option>
            <option v-for="c in CUTS_MODES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>
      <div v-if="showsCutValues" class="d-flex flex-wrap gap-2 mt-2">
        <div class="flex-fill" style="min-width:8rem">
          <label class="text-muted d-block" style="font-size:0.7rem">
            Low {{ settings.cuts === 'percentile' ? '(percentile)' : '(ADU)' }}
          </label>
          <input
            :value="settings.lo"
            type="number"
            step="any"
            class="form-control form-control-sm"
            :placeholder="settings.cuts === 'percentile' ? String(DEFAULT_PERCENTILES.lo) : ''"
            @input="onNumberInput('lo', $event)"
          />
        </div>
        <div class="flex-fill" style="min-width:8rem">
          <label class="text-muted d-block" style="font-size:0.7rem">
            High {{ settings.cuts === 'percentile' ? '(percentile)' : '(ADU)' }}
          </label>
          <input
            :value="settings.hi"
            type="number"
            step="any"
            class="form-control form-control-sm"
            :placeholder="settings.cuts === 'percentile' ? String(DEFAULT_PERCENTILES.hi) : ''"
            @input="onNumberInput('hi', $event)"
          />
        </div>
      </div>
      <div v-if="settingsError" class="text-danger mt-1" style="font-size:0.75rem">{{ settingsError }}</div>
    </div>
  </div>
</template>
