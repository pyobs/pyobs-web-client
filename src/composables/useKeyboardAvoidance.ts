import { onMounted, onUnmounted } from 'vue'

// Keeps a focused text/number input visible above the on-screen keyboard —
// see specs/plans/2026-09-09-keyboard-avoidance.md. The app went edge-to-edge
// for the safe-area-insets plan, and edge-to-edge WebViews don't reliably get
// the classic Android adjustResize pan/resize behavior for free, so a focused
// field near the bottom of the screen can end up hidden under the IME.
//
// Global `focusin` listener rather than per-input handling — covers every
// current and future text/number/select field with one hook, no per-view or
// per-component changes needed.
const FOCUSABLE_SELECTOR = 'input, textarea, select'

// The on-screen keyboard's open animation takes a moment; scrolling
// immediately on focus measures the layout before the keyboard (and any
// viewport resize) has actually happened, landing in the wrong place.
const SCROLL_DELAY_MS = 300

export function useKeyboardAvoidance() {
  function onFocusIn(event: FocusEvent) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (!target.matches(FOCUSABLE_SELECTOR)) return

    setTimeout(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, SCROLL_DELAY_MS)
  }

  onMounted(() => document.addEventListener('focusin', onFocusIn))
  onUnmounted(() => document.removeEventListener('focusin', onFocusIn))
}
