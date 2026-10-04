<script setup lang="ts">
// Raw ("full quality") live view: reads /video.raw (pyobs-core BaseVideo >= 2.13.0) with a streamed
// fetch(), stretches every frame in the browser onto a canvas. Stretch and cuts change live, with no
// reconnect. See specs/plans/2026-10-04-video-live-view-modes.md (phase b) and
// specs/adrs/0002-raw-live-view-needs-basevideo-cors.md.
import { ref, computed, watch, onBeforeUnmount, onMounted } from 'vue'
import { RawFrameParser, type RawFrame } from '@/utils/rawFrameParser'
import { stretchToRgba } from '@/utils/stretch'
import {
  canvasToFull,
  cropFor,
  frameCoverage,
  frameIndexAt,
  intersect,
  needsReconnect,
  panView,
  toFramePixels,
  zoomView,
  type Rect,
  type Size,
} from '@/utils/viewport'
import {
  BIN_CHOICES,
  MAX_RATE_CHOICES,
  buildRawUrl,
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

// ── Zoom and pan (phase c) ───────────────────────────────────────────────────
// `view` is the region shown, in full-frame unbinned pixels (undefined = whole frame). The stream
// asks the server for a crop of the view plus a margin, so panning a little needs no reconnect.
// Until the new stream's first frame arrives, the frame in hand is drawn zoomed (pixelated), so
// zooming responds at once and then sharpens.
const fullSize = ref<Size | undefined>(undefined)
const view = ref<Rect | undefined>(undefined)
const requestedCrop = ref<Rect | undefined>(undefined)
const zoomed = computed(() => view.value !== undefined)
const cursorText = ref('')
const CROP_DEBOUNCE_MS = 250
let cropTimer: ReturnType<typeof setTimeout> | undefined

function setView(next: Rect | undefined) {
  view.value = next
  scheduleRender()
  const full = fullSize.value
  if (!full || !needsReconnect(full, requestedCrop.value, next)) return
  clearTimeout(cropTimer)
  cropTimer = setTimeout(() => (requestedCrop.value = cropFor(full, view.value)), CROP_DEBOUNCE_MS)
}

function zoomBy(factor: number, anchor?: { x: number; y: number }) {
  if (fullSize.value) setView(zoomView(fullSize.value, view.value, factor, anchor))
}

function resetZoom() {
  setView(undefined)
}

// A camera change starts from scratch: other frame size, other everything.
watch(
  () => props.url,
  () => {
    clearTimeout(cropTimer)
    fullSize.value = undefined
    view.value = undefined
    requestedCrop.value = undefined
  },
)

// The canvas shows `drawn`, a region in full-frame coordinates; pointer positions map through it.
let drawn: Rect | undefined

function pointerToFull(e: PointerEvent | WheelEvent): { x: number; y: number } | undefined {
  const el = canvas.value
  if (!el || !drawn) return undefined
  const box = el.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return undefined
  return canvasToFull(drawn, { w: box.width, h: box.height }, e.clientX - box.left, e.clientY - box.top)
}

function onWheel(e: WheelEvent) {
  const at = pointerToFull(e)
  zoomBy(e.deltaY < 0 ? 1.25 : 1 / 1.25, at)
}

let dragging = false
function onPointerDown(e: PointerEvent) {
  if (!view.value) return
  dragging = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  const el = canvas.value
  if (dragging && view.value && fullSize.value && drawn && el) {
    // dragging moves the image, so the view moves the other way
    const perPixel = drawn.w / el.getBoundingClientRect().width
    setView(panView(fullSize.value, view.value, -e.movementX * perPixel, -e.movementY * perPixel))
    return
  }
  const at = pointerToFull(e)
  const frame = latest
  if (!at || !frame) {
    cursorText.value = ''
    return
  }
  const idx = frameIndexAt(frame.meta, frame.width, frame.height, at.x, at.y)
  const value = idx === undefined ? undefined : frame.data[idx]
  const shown = value === undefined ? '' : Number.isInteger(value) ? String(value) : value.toFixed(1)
  cursorText.value = `x ${Math.floor(at.x)}, y ${Math.floor(at.y)}${shown ? `: ${shown}` : ''}`
}
function onPointerUp() {
  dragging = false
}

// ── Rendering ────────────────────────────────────────────────────────────────
// Only the newest frame is drawn: frames that arrive between two animation frames are dropped
// (the server does the same for slow consumers), so a slow stretch can't build a backlog.
let latest: RawFrame | undefined
let imageData: ImageData | undefined
let stretched: HTMLCanvasElement | undefined
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

  // The whole received frame is stretched onto an off-screen canvas; the visible one then shows the
  // part of it that is in view.
  stretched ??= document.createElement('canvas')
  if (stretched.width !== frame.width || stretched.height !== frame.height) {
    stretched.width = frame.width
    stretched.height = frame.height
    imageData = undefined
  }
  const off = stretched.getContext('2d')
  const ctx = el.getContext('2d')
  if (!off || !ctx) return
  imageData ??= off.createImageData(frame.width, frame.height)
  const [low, high] = stretchToRgba(
    frame.data,
    frame.width,
    frame.height,
    settings.value,
    frame.meta.SRCDTYPE ?? frame.meta.DTYPE,
    imageData.data,
  )
  off.putImageData(imageData, 0, 0)

  const coverage = frameCoverage(frame.meta, frame.width, frame.height)
  // Anything of the view the frame doesn't cover waits for the reconnect; nothing to show yet if
  // there is no overlap at all, so the previous drawing stays.
  const region = intersect(view.value ?? coverage, coverage)
  if (!region) return
  const src = toFramePixels(frame.meta, region)
  el.width = Math.max(1, Math.round(src.w))
  el.height = Math.max(1, Math.round(src.h))
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(stretched, src.x, src.y, src.w, src.h, 0, 0, el.width, el.height)
  drawn = region

  const num = frame.meta.VIDFRAME !== undefined ? `frame ${frame.meta.VIDFRAME}, ` : ''
  const bin = (frame.meta.SWBIN ?? 1) > 1 ? `, bin ${frame.meta.SWBIN}` : ''
  frameInfo.value = `${num}${frame.width}x${frame.height}${bin}, cuts ${Math.round(low)} to ${Math.round(high)}`
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

// A tab nobody is looking at doesn't need frames at the full rate: drop to 1 fps until it is back.
const hidden = ref(document.hidden)
function onVisibility() {
  hidden.value = document.hidden
}
onMounted(() => document.addEventListener('visibilitychange', onVisibility))
const effectiveMaxRate = computed(() => {
  const want = settings.value.maxRate
  return hidden.value ? (want > 0 ? Math.min(want, 1) : 1) : want
})
const streamUrl = computed(() =>
  buildRawUrl(props.url, { crop: requestedCrop.value, bin: settings.value.bin, maxRate: effectiveMaxRate.value }),
)

function explain(e: unknown): string {
  if (e instanceof TypeError) {
    // fetch() reports CORS rejections, DNS and refused connections all as the same TypeError.
    return (
      "Couldn't open the raw stream. If the camera runs on a different origin than this app, its " +
      'BaseVideo module needs the cors_origins option set (pyobs-core 2.14.0 or later). Otherwise ' +
      'check that the module is reachable.'
    )
  }
  return e instanceof Error ? e.message : String(e)
}

// `soft` is a reconnect for a new crop, binning or rate: the picture in hand stays up (zoomed, see
// above) until the new stream's first frame replaces it, instead of dropping back to "Connecting".
async function start(soft = false) {
  stop()
  const controller = new AbortController()
  abort = controller
  errorText.value = ''
  if (!soft || status.value === 'error') {
    status.value = 'connecting'
    frameInfo.value = ''
    latest = undefined
    imageData = undefined
  }
  // what this connection was asked for: a frame from one without a crop shows the whole camera
  const askedForCrop = requestedCrop.value !== undefined
  try {
    const res = await fetch(streamUrl.value, {
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
      // a chunk can land just after this connection was replaced; it must not touch the new state
      if (done || controller.signal.aborted) break
      const frames = parser.push(value)
      if (frames.length > 0) {
        const frame = frames[frames.length - 1]!
        latest = frame
        if (!askedForCrop) {
          const bin = frame.meta.SWBIN ?? 1
          const size = { w: frame.width * bin, h: frame.height * bin }
          if (fullSize.value?.w !== size.w || fullSize.value?.h !== size.h) fullSize.value = size
        }
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

let connectedTo = ''
watch(
  () => [streamUrl.value, props.token],
  () => {
    const target = `${props.url}\n${props.token ?? ''}`
    const soft = target === connectedTo
    connectedTo = target
    void start(soft)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stop()
  clearTimeout(cropTimer)
  document.removeEventListener('visibilitychange', onVisibility)
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="pyobs-card p-0" style="overflow:hidden">
      <canvas
        v-show="status === 'streaming' && !colourNotice"
        ref="canvas"
        :style="{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', cursor: zoomed ? 'grab' : 'zoom-in' }"
        data-testid="raw-canvas"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="cursorText = ''"
        @dblclick="resetZoom"
      ></canvas>
      <div v-if="status === 'connecting'" class="text-muted p-3" style="font-size:0.85rem">Connecting...</div>
      <div v-else-if="status === 'error'" class="text-danger p-3" style="font-size:0.85rem">
        {{ errorText }}
        <div class="mt-2">
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="start()">Retry</button>
        </div>
      </div>
      <div v-else-if="colourNotice" class="text-muted p-3" style="font-size:0.85rem">
        This camera sends colour frames, which the raw view doesn't display yet. Use the low bandwidth
        (MJPEG) mode.
      </div>
      <div
        v-if="status === 'streaming' && frameInfo"
        class="d-flex justify-content-between text-muted px-2 py-1"
        style="font-size:0.7rem"
      >
        <span>{{ frameInfo }}</span>
        <span data-testid="raw-cursor">{{ cursorText }}</span>
      </div>
    </div>

    <div class="d-flex align-items-center gap-1" data-testid="raw-zoom">
      <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!fullSize" data-testid="zoom-out" aria-label="Zoom out" @click="zoomBy(1 / 1.5)">-</button>
      <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!fullSize" data-testid="zoom-in" aria-label="Zoom in" @click="zoomBy(1.5)">+</button>
      <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!zoomed" data-testid="zoom-reset" @click="resetZoom">Reset zoom</button>
      <span class="text-muted ms-1" style="font-size:0.7rem">Scroll to zoom, drag to pan, double-click to reset.</span>
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
      <div class="d-flex flex-wrap gap-2 mt-2">
        <div class="flex-fill" style="min-width:8rem">
          <label class="text-muted d-block" style="font-size:0.7rem">Binning (server)</label>
          <select v-model.number="settings.bin" class="form-select form-select-sm" data-testid="raw-bin">
            <option v-for="b in BIN_CHOICES" :key="b" :value="b">{{ b === 1 ? 'None' : `${b}x${b}` }}</option>
          </select>
        </div>
        <div class="flex-fill" style="min-width:8rem">
          <label class="text-muted d-block" style="font-size:0.7rem">Max frame rate</label>
          <select v-model.number="settings.maxRate" class="form-select form-select-sm" data-testid="raw-max-rate">
            <option v-for="r in MAX_RATE_CHOICES" :key="r" :value="r">{{ r === 0 ? 'Unlimited' : `${r} fps` }}</option>
          </select>
        </div>
      </div>
      <div v-if="settingsError" class="text-danger mt-1" style="font-size:0.75rem">{{ settingsError }}</div>
    </div>
  </div>
</template>
