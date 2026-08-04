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
// Room on the bottom/left for a tick-value row plus the axis-label row below/left of it.
const PADDING = { top: 10, right: 14, bottom: 34, left: 50 }

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

  // axis tick values — edges (±halfRange) and origin, drawn outside the box
  // (below it for x, left of it for y) so they don't collide with plotted
  // points or the crosshair itself.
  const fmt = (v: number) => v.toFixed(v < 10 ? 2 : 1)
  ctx.fillStyle = '#8a8f98'
  ctx.font = '9px sans-serif'

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`-${fmt(halfRange)}`, plotLeft, plotBottom + 3)
  ctx.textAlign = 'center'
  ctx.fillText('0', cx, plotBottom + 3)
  ctx.textAlign = 'right'
  ctx.fillText(fmt(halfRange), plotRight, plotBottom + 3)

  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText(fmt(halfRange), plotLeft - 4, plotTop)
  ctx.textBaseline = 'middle'
  ctx.fillText('0', plotLeft - 4, cy)
  ctx.textBaseline = 'bottom'
  ctx.fillText(`-${fmt(halfRange)}`, plotLeft - 4, plotBottom)

  // axis labels
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(props.xLabel, cx, plotBottom + 15)
  ctx.save()
  ctx.translate(10, cy)
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
