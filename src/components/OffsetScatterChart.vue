<script setup lang="ts">
// Minimal hand-rolled <canvas> equal-aspect scatter chart for a 2D offset
// trajectory (lon/lat, RA/Dec, Alt/Az, …) — shared shape between the
// AutoGuiding and (future) Acquisition pages, see
// specs/plans/autoguiding-widget.md and specs/plans/acquisition-widget.md.
// Origin crosshair, distinct "start"/"latest" markers, equal-aspect scaling
// so a circular error distribution doesn't render visually stretched.
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  points: { x: number; y: number }[]
  xLabel: string
  yLabel: string
}>()

const canvasRef = ref<HTMLCanvasElement>()

const SIZE = 300 // square plot — required for true equal-aspect scaling
const PADDING = { top: 10, right: 10, bottom: 20, left: 36 }

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = SIZE * dpr
  canvas.height = SIZE * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, SIZE, SIZE)

  const points = props.points

  const plotLeft = PADDING.left
  const plotRight = SIZE - PADDING.right
  const plotTop = PADDING.top
  const plotBottom = SIZE - PADDING.bottom
  const plotSize = Math.min(plotRight - plotLeft, plotBottom - plotTop)

  // Equal-aspect: one shared half-range around 0 for both axes.
  const maxAbs = points.length > 0 ? Math.max(...points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) : 1
  const halfRange = (maxAbs || 1) * 1.2

  const cx = plotLeft + plotSize / 2
  const cy = plotTop + plotSize / 2
  const x = (v: number) => cx + (v / halfRange) * (plotSize / 2)
  const y = (v: number) => cy - (v / halfRange) * (plotSize / 2)

  // origin crosshair
  ctx.strokeStyle = '#2d3035'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(plotLeft, cy)
  ctx.lineTo(plotRight, cy)
  ctx.moveTo(cx, plotTop)
  ctx.lineTo(cx, plotBottom)
  ctx.stroke()

  // border
  ctx.strokeStyle = '#2d3035'
  ctx.strokeRect(cx - plotSize / 2, cy - plotSize / 2, plotSize, plotSize)

  if (points.length > 0) {
    // trajectory points
    ctx.fillStyle = '#fd7e14'
    for (const p of points) {
      ctx.beginPath()
      ctx.arc(x(p.x), y(p.y), 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // start marker
    const start = points[0]!
    ctx.strokeStyle = '#8a8f98'
    ctx.lineWidth = 1.5
    const sx = x(start.x)
    const sy = y(start.y)
    ctx.beginPath()
    ctx.moveTo(sx - 5, sy)
    ctx.lineTo(sx + 5, sy)
    ctx.moveTo(sx, sy - 5)
    ctx.lineTo(sx, sy + 5)
    ctx.stroke()

    // latest marker (star-ish diamond)
    const latest = points[points.length - 1]!
    ctx.fillStyle = '#20c997'
    const lx = x(latest.x)
    const ly = y(latest.y)
    ctx.beginPath()
    ctx.moveTo(lx, ly - 6)
    ctx.lineTo(lx + 6, ly)
    ctx.lineTo(lx, ly + 6)
    ctx.lineTo(lx - 6, ly)
    ctx.closePath()
    ctx.fill()
  }

  // axis labels
  ctx.fillStyle = '#8a8f98'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(props.xLabel, cx, plotBottom + 4)
  ctx.save()
  ctx.translate(plotLeft - 8, cy)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(props.yLabel, 0, 0)
  ctx.restore()
}

watch(() => props.points, draw, { deep: true })
onMounted(draw)
</script>

<template>
  <canvas ref="canvasRef" :width="SIZE" :height="SIZE" style="max-width:100%; height:auto; width:100%; aspect-ratio:1"></canvas>
</template>
