<script setup lang="ts">
// Phase 1 of specs/plans/camera-page.md: standalone FITS decode/render
// widget. Takes raw (optionally gzipped) FITS bytes and rasterizes them to
// a <canvas> — no camera page, module list, or grab_data() call here; a
// live module is phase 2's concern, this is verified against a static
// fixture. Decode/render logic itself lives in the `pyobs-fits` workspace
// package (framework-agnostic, so it can be extracted into its own repo
// later without rework) — this component is just the Vue wrapper.
import { ref, watch } from 'vue'
import { maybeGunzip, parseFits, toImageData } from 'pyobs-fits'

const props = defineProps<{ data: Uint8Array | null }>()

const canvasRef = ref<HTMLCanvasElement>()
const loading = ref(false)
const error = ref('')

async function render() {
  error.value = ''
  const bytes = props.data
  if (!bytes) return

  loading.value = true
  try {
    const decompressed = await maybeGunzip(bytes)
    const { image } = parseFits(decompressed.buffer as ArrayBuffer)
    const imageData = toImageData(image)

    const canvas = canvasRef.value
    if (!canvas) return
    canvas.width = image.width
    canvas.height = image.height
    canvas.getContext('2d')?.putImageData(imageData, 0, 0)
  } catch (e) {
    error.value = String(e)
  } finally {
    loading.value = false
  }
}

watch(() => props.data, render, { immediate: true })
</script>

<template>
  <div>
    <div v-if="loading" class="text-body-secondary small">Decoding…</div>
    <div v-if="error" class="alert alert-danger py-1 px-2 mb-0" style="font-size:0.8rem">{{ error }}</div>
    <canvas ref="canvasRef" style="max-width:100%; height:auto"></canvas>
  </div>
</template>
