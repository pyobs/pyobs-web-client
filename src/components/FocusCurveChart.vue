<script setup lang="ts">
// Minimal hand-rolled <canvas> scatter chart for one IAutoFocus run's curve
// (focus vs. metric value), with an optional dashed vertical line at the
// fitted result once available. See specs/plans/autofocus-widget.md — no
// charting library dependency, same shape as TimeSeriesChart.vue but
// focus-keyed instead of time-keyed, and no zoom/pan (a focus curve is
// small, fixed-range data).
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  points: { focus: number; value: number }[]
  result?: { focus: number; focusErr: number }
}>()

const canvasRef = ref<HTMLCanvasElement>()

const WIDTH = 600
const HEIGHT = 220
const PADDING = { top: 10, right: 10, bottom: 24, left: 36 }

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

  const focuses = points.map((p) => p.focus)
  const values = points.map((p) => p.value)
  const minFocusRaw = Math.min(...focuses)
  const maxFocusRaw = Math.max(...focuses)
  const focusPad = (maxFocusRaw - minFocusRaw) * 0.1 || 1
  const minFocus = minFocusRaw - focusPad
  const maxFocus = maxFocusRaw + focusPad
  const minValueRaw = Math.min(...values)
  const maxValueRaw = Math.max(...values)
  const valuePad = (maxValueRaw - minValueRaw) * 0.1 || 1
  const minValue = minValueRaw - valuePad
  const maxValue = maxValueRaw + valuePad

  const x = (f: number) => plotLeft + ((f - minFocus) / (maxFocus - minFocus)) * (plotRight - plotLeft)
  const y = (v: number) => plotBottom - ((v - minValue) / (maxValue - minValue)) * (plotBottom - plotTop)

  // gridlines
  ctx.strokeStyle = '#2d3035'
  ctx.lineWidth = 1
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const gy = plotTop + frac * (plotBottom - plotTop)
    ctx.beginPath()
    ctx.moveTo(plotLeft, gy)
    ctx.lineTo(plotRight, gy)
    ctx.stroke()
  }

  // axes
  ctx.strokeStyle = '#2d3035'
  ctx.beginPath()
  ctx.moveTo(plotLeft, plotTop)
  ctx.lineTo(plotLeft, plotBottom)
  ctx.lineTo(plotRight, plotBottom)
  ctx.stroke()

  // fitted result: dashed vertical line
  if (props.result) {
    ctx.save()
    ctx.strokeStyle = '#ffc107'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    const rx = x(props.result.focus)
    ctx.beginPath()
    ctx.moveTo(rx, plotTop)
    ctx.lineTo(rx, plotBottom)
    ctx.stroke()
    ctx.restore()
  }

  // scatter points
  ctx.fillStyle = '#0d6efd'
  for (const p of points) {
    ctx.beginPath()
    ctx.arc(x(p.focus), y(p.value), 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // axis labels
  ctx.fillStyle = '#8a8f98'
  ctx.font = '10px sans-serif'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(minFocusRaw.toFixed(2), plotLeft, plotBottom + 4)
  ctx.textAlign = 'right'
  ctx.fillText(maxFocusRaw.toFixed(2), plotRight, plotBottom + 4)

  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText(maxValueRaw.toFixed(2), plotLeft - 4, plotTop)
  ctx.textBaseline = 'bottom'
  ctx.fillText(minValueRaw.toFixed(2), plotLeft - 4, plotBottom)

  if (props.result) {
    ctx.fillStyle = '#ffc107'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(
      `focus ${props.result.focus.toFixed(3)} ± ${props.result.focusErr.toFixed(3)}`,
      x(props.result.focus),
      plotTop + 12,
    )
  }
}

watch(() => [props.points, props.result], draw, { deep: true })
onMounted(draw)
</script>

<template>
  <canvas ref="canvasRef" :width="WIDTH" :height="HEIGHT" style="max-width:100%; height:auto; width:100%"></canvas>
</template>
