<script setup lang="ts">
// Minimal hand-rolled <canvas> line chart: offset magnitude (sqrt(lon²+lat²))
// vs. sample index, for IAutoGuiding's rolling correction history. Same
// no-charting-library convention as TimeSeriesChart.vue/FocusCurveChart.vue,
// x-axis is a plain sample index rather than time. See
// specs/plans/autoguiding-widget.md.
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  values: number[] // offset magnitude per sample, arcsec
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

  const values = props.values
  if (values.length === 0) return

  const plotLeft = PADDING.left
  const plotRight = WIDTH - PADDING.right
  const plotTop = PADDING.top
  const plotBottom = HEIGHT - PADDING.bottom

  const minValueRaw = Math.min(...values)
  const maxValueRaw = Math.max(...values, 0)
  const valuePad = (maxValueRaw - minValueRaw) * 0.1 || 1
  const minValue = 0 // magnitude is non-negative — anchor the baseline at 0
  const maxValue = maxValueRaw + valuePad

  const x = (i: number) =>
    values.length === 1 ? plotLeft : plotLeft + (i / (values.length - 1)) * (plotRight - plotLeft)
  const y = (v: number) => plotBottom - ((v - minValue) / (maxValue - minValue)) * (plotBottom - plotTop)

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
  values.forEach((v, i) => {
    const px = x(i)
    const py = y(v)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.stroke()

  ctx.fillStyle = '#0d6efd'
  values.forEach((v, i) => {
    ctx.beginPath()
    ctx.arc(x(i), y(v), 2, 0, Math.PI * 2)
    ctx.fill()
  })

  // axis labels
  ctx.fillStyle = '#8a8f98'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText(maxValue.toFixed(1), plotLeft - 4, plotTop)
  ctx.textBaseline = 'bottom'
  ctx.fillText(minValue.toFixed(1), plotLeft - 4, plotBottom)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Offset magnitude [arcsec]', plotLeft, plotTop + 10)
  ctx.textAlign = 'right'
  ctx.fillText(`${values[values.length - 1]!.toFixed(2)}"`, plotRight, plotTop + 10)
}

watch(() => props.values, draw, { deep: true })
onMounted(draw)
</script>

<template>
  <canvas ref="canvasRef" :width="WIDTH" :height="HEIGHT" style="max-width:100%; height:auto; width:100%"></canvas>
</template>
