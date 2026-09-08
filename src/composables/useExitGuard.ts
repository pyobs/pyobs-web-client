import { ref, onMounted, onUnmounted } from 'vue'
import router from '@/router'

// Mobile edge-swipe-back / hardware back-button guard for the Dashboard
// screen — see issue #45. Root cause: LoginView.vue's post-login navigation
// is a router.replace(), which overwrites the current history entry instead
// of pushing a new one, so Dashboard ends up with *no* prior in-app history
// entry beneath it. A back-gesture from there has nothing left in this tab's
// session history to pop to, so the browser/PWA falls through to its own
// exit behavior instead of firing anything page JS can intercept — no
// `popstate`, no `beforeunload`, nothing. Every other screen is reached via
// router.push (a real, pushed history entry), so back-gestures there behave
// normally already; this guard is deliberately scoped to Dashboard alone,
// not applied globally.
//
// Fix: keep one inert "sentinel" history entry (same URL, so nothing visibly
// changes) pushed on top of Dashboard's real entry whenever Dashboard is the
// current route. A back-gesture then always has the sentinel to consume
// first, which *does* fire `popstate` — that's the hook this uses to show a
// confirm dialog instead of silently falling through to a real exit.
//
// NOTE: only covers landing on Dashboard after login. A deep link straight
// into some other screen (e.g. a bookmarked module URL) has the same
// zero-history problem and isn't covered here — the issue's own "identify
// which screens are affected" step wasn't done for every possible entry
// point, just the one confirmed via router.replace(). Flagged as a known gap
// rather than guessed at.
const SENTINEL_STATE = { pyobsExitGuard: true }

export function useExitGuard() {
  const showConfirmExit = ref(false)
  let armed = false

  function arm() {
    if (armed) return
    history.pushState(SENTINEL_STATE, '')
    armed = true
  }

  function onPopState(event: PopStateEvent) {
    if (!armed) return // not on a guarded screen right now — let router handle it normally
    armed = false
    if ((event.state as typeof SENTINEL_STATE | null)?.pyobsExitGuard) return // landed on a sentinel, not past it
    showConfirmExit.value = true
  }

  function onRouteSettled() {
    if (router.currentRoute.value.name === 'dashboard') {
      arm()
    } else {
      armed = false
    }
  }

  let stopAfterEach: (() => void) | undefined

  onMounted(() => {
    window.addEventListener('popstate', onPopState)
    stopAfterEach = router.afterEach(onRouteSettled)
    onRouteSettled()
  })

  onUnmounted(() => {
    window.removeEventListener('popstate', onPopState)
    stopAfterEach?.()
  })

  function cancelExit() {
    showConfirmExit.value = false
    arm()
  }

  function confirmExit() {
    showConfirmExit.value = false
    // Deliberately don't re-arm — the next back-gesture exits for real.
  }

  return { showConfirmExit, cancelExit, confirmExit }
}
