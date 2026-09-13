import { App } from '@capacitor/app'
import { useXmpp } from '@/composables/useXmpp'

// Detects foreground resume (app switch, screen lock, or — on the web build, since @capacitor/app
// is Page-Visibility-API-backed there — a tab regaining visibility) and heals a dropped XMPP
// connection automatically. See specs/design/background-foreground-reconnect.md: the OS suspends
// background network activity, so a WebSocket held open across backgrounding is often dead by the
// time the app resumes even though Strophe still reports it as 'connected' — a resume-time
// liveness probe is required to actually know.
//
// Not native-gated (unlike usePushNotifications.ts) — this listener is meant to fire in the web
// build too.

let initialized = false

export function useAppLifecycle() {
  async function initialize(): Promise<void> {
    if (initialized) return
    initialized = true

    const { status, attemptReconnectFromStorage, pingServer } = useXmpp()

    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return // nothing to proactively do on backgrounding — see design doc

      if (status.value !== 'connected') {
        attemptReconnectFromStorage()
        return
      }

      pingServer().then((alive) => {
        if (!alive) attemptReconnectFromStorage()
      })
    })
  }

  return { initialize }
}
