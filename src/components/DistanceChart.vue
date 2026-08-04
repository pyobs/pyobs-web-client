<script setup lang="ts">
// Minimal hand-rolled <canvas> line chart: acquisition distance-to-target
// (arcsec) per attempt number. Same no-charting-library shape as
// OffsetMagnitudeChart.vue, but x is the attempt number rather than a plain
// sample index. See specs/plans/acquisition-widget.md.
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  points: { attempt: number; distance: number }[]
}>()

const canvasRef = ref<HTMLCanvasElement>()

const WIDTH = 600
const HEIGHT = 160
const PADDING = { top: 10, right: 10, bottom: 20, left: 36 }

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = WIDTH * dpr
  canvas.height = HEIGHT * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, WIDTH, HEIGHT)

  const points = props.points
  if (points.length === 0) return

  const plotLeft = PADDING.left
  const plotRight = WIDTH - PADDING.right
  const plotTop = PADDING.top
  const plotBottom = HEIGHT - PADDING.bottom

  const attempts = points.map((p) => p.attempt)
  const distances = points.map((p) => p.distance)

  const minAttempt = Math.min(...attempts)
  const maxAttempt = Math.max(...attempts)

  const maxDistanceRaw = Math.max(...distances, 0)
  const minDistance = 0 // distance is non-negative — anchor the baseline at 0
  const maxDistance = maxDistanceRaw + (maxDistanceRaw * 0.1 || 1)

  const x = (a: number) =>
    maxAttempt === minAttempt ? plotLeft : plotLeft + ((a - minAttempt) / (maxAttempt - minAttempt)) * (plotRight - plotLeft)
  const y = (v: number) => plotBottom - ((v - minDistance) / (maxDistance - minDistance)) * (plotBottom - plotTop)

  // gridlines
  ctx.strokeStyle = '#2d3035'
  ctx.lineWidth = 1
  for (const frac of [0, 0.5, 1]) {
    const gy = plotTop + frac * (plotBottom - plotTop)
    ctx.beginPath()
    ctx.moveTo(plotLeft, gy)
    ctx.lineTo(plotRight, gy)
    ctx.stroke()
  }

  // line + markers
  ctx.strokeStyle = '#0d6efd'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  points.forEach((p, i) => {
    const px = x(p.attempt)
    const py = y(p.distance)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.stroke()

  ctx.fillStyle = '#0d6efd'
  points.forEach((p) => {
    ctx.beginPath()
    ctx.arc(x(p.attempt), y(p.distance), 2, 0, Math.PI * 2)
    ctx.fill()
  })

  // axis labels
  ctx.fillStyle = '#8a8f98'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText(maxDistance.toFixed(1), plotLeft - 4, plotTop)
  ctx.textBaseline = 'bottom'
  ctx.fillText(minDistance.toFixed(1), plotLeft - 4, plotBottom)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Distance [arcsec]', plotLeft, plotTop + 10)
  ctx.textAlign = 'right'
  ctx.fillText(`attempt ${attempts[attempts.length - 1]}`, plotRight, plotTop + 10)
}

watch(() => props.points, draw, { deep: true })
onMounted(draw)
</script>

<template>
  <canvas ref="canvasRef" :width="WIDTH" :height="HEIGHT" style="max-width:100%; height:auto; width:100%"></canvas>
</template>
