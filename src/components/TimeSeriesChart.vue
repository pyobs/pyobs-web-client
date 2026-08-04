<script setup lang="ts">
// Minimal hand-rolled <canvas> line chart for a single bounded time series.
// No charting library dependency — see specs/plans/weather-widget.md and the
// sibling AutoFocus/Acquisition/AutoGuiding plans, which share this shape
// (bounded time-series, x-axis time-formatted, small multiples).
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  points: { time: number; value: number }[] // time in ms since epoch
  label?: string
  unit?: string
}>()

const canvasRef = ref<HTMLCanvasElement>()

const WIDTH = 600
const HEIGHT = 140
const PADDING = { top: 10, right: 10, bottom: 20, left: 10 }

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

  const times = points.map((p) => p.time)
  const values = points.map((p) => p.value)
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const minValueRaw = Math.min(...values)
  const maxValueRaw = Math.max(...values)
  const valuePad = (maxValueRaw - minValueRaw) * 0.1 || 1
  const minValue = minValueRaw - valuePad
  const maxValue = maxValueRaw + valuePad

  const x = (t: number) => (maxTime === minTime ? plotLeft : plotLeft + ((t - minTime) / (maxTime - minTime)) * (plotRight - plotLeft))
  const y = (v: number) => plotBottom - ((v - minValue) / (maxValue - minValue)) * (plotBottom - plotTop)

  // baseline
  ctx.strokeStyle = '#2d3035'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(plotLeft, plotBottom)
  ctx.lineTo(plotRight, plotBottom)
  ctx.stroke()

  // line
  ctx.strokeStyle = '#0d6efd'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  points.forEach((p, i) => {
    const px = x(p.time)
    const py = y(p.value)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.stroke()

  // time-axis labels (first/last)
  ctx.fillStyle = '#8a8f98'
  ctx.font = '10px sans-serif'
  ctx.textBaseline = 'top'
  const fmt = (t: number) =>
    new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  ctx.textAlign = 'left'
  ctx.fillText(fmt(minTime), plotLeft, plotBottom + 4)
  ctx.textAlign = 'right'
  ctx.fillText(fmt(maxTime), plotRight, plotBottom + 4)

  // label + current value, top-left / top-right
  const last = points[points.length - 1]!
  ctx.fillStyle = '#adb5bd'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (props.label) ctx.fillText(props.label, plotLeft, plotTop + 8)
  ctx.fillStyle = '#e9ecef'
  ctx.textAlign = 'right'
  ctx.fillText(`${last.value.toFixed(2)}${props.unit ? ` ${props.unit}` : ''}`, plotRight, plotTop + 8)
}

watch(() => props.points, draw, { deep: true })
onMounted(draw)
</script>

<template>
  <canvas ref="canvasRef" :width="WIDTH" :height="HEIGHT" style="max-width:100%; height:auto; width:100%"></canvas>
</template>
