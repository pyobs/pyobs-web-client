import { onMounted, onUnmounted, ref, type Ref } from 'vue'

// Drives a hand-rolled <canvas> chart's internal resolution from its actual
// rendered CSS width, instead of a fixed constant sized for desktop. The 5
// chart components (OffsetMagnitudeChart, DistanceChart, FocusCurveChart,
// TimeSeriesChart, OffsetScatterChart) used to draw at one fixed WIDTH
// (600, in most of them) and rely on CSS `width:100%` to shrink the whole
// canvas for narrow containers — every axis label/tick, drawn at fixed
// internal pixel coordinates assuming the full 600px width, shrank
// proportionally along with it, becoming illegible well before phone width
// (confirmed live: DistanceChart measured a 2.76x downscale below its design
// width on a 400px-wide viewport — see
// specs/plans/2026-09-07-widget-visual-redesign.md's corrections). Reading
// the canvas's own actual rendered width here and drawing at that resolution
// means text is always sized relative to what's actually visible, on any
// screen, wide or narrow.
export function useResponsiveCanvas(canvasRef: Ref<HTMLCanvasElement | undefined>, redraw: () => void): Ref<number> {
  const width = ref(600) // matches every chart's old fixed WIDTH — sane default before first measurement
  let observer: ResizeObserver | undefined

  function measureAndRedraw() {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width > 0) width.value = rect.width
    redraw()
  }

  onMounted(() => {
    const canvas = canvasRef.value
    if (canvas) {
      observer = new ResizeObserver(measureAndRedraw)
      observer.observe(canvas)
    }
    measureAndRedraw()
  })

  onUnmounted(() => observer?.disconnect())

  return width
}
