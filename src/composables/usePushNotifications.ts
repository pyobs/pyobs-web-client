import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from '@capacitor/push-notifications'

// Native-only (Android/iOS) — push notifications need a real device
// registration (FCM/APNs), no meaningful web equivalent for this app; a
// no-op everywhere else. This is the feasibility spike itself
// (specs/design/native-app-shell-capacitor.md's "Push notifications"
// section, phase 3, "Test this early"), not the full alerting feature —
// there is no server/relay yet that sends anything meaningful to the token
// this obtains. What this proves: permission prompts work, a real FCM/APNs
// token comes back, and a manually-sent test push (e.g. from the Firebase
// console) is received and logged.
//
// Registration is deliberately independent of XMPP login state — a device
// token is a property of the device/app install, not of which pyobs account
// happens to be logged in at the moment; associating a token with an
// account server-side is a later, not-yet-designed step.

const token = ref<string | null>(null)
const registrationError = ref<string | null>(null)
const lastReceived = ref<PushNotificationSchema | null>(null)

let initialized = false

export function usePushNotifications() {
  async function initialize(): Promise<void> {
    if (initialized || !Capacitor.isNativePlatform()) return
    initialized = true

    // PushNotifications.register() calls FirebaseMessaging.getInstance()
    // natively (Android) — without a real google-services.json, that's an
    // uncaught IllegalStateException on a Capacitor plugin thread that
    // crashes the whole app, not something a JS try/catch can reach.
    // Confirmed live on-device. Skip the whole flow (permission prompt
    // included — nothing it would unlock yet) until Firebase is actually
    // configured; see vite.config.ts's __PUSH_NOTIFICATIONS_CONFIGURED__.
    if (!__PUSH_NOTIFICATIONS_CONFIGURED__) {
      registrationError.value = 'Not configured yet (google-services.json missing) — see specs/design/native-app-shell-capacitor.md'
      return
    }

    try {
      let permission = await PushNotifications.checkPermissions()
      if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
        permission = await PushNotifications.requestPermissions()
      }
      if (permission.receive !== 'granted') {
        registrationError.value = `Push permission ${permission.receive}`
        return
      }

      PushNotifications.addListener('registration', (t: Token) => {
        token.value = t.value
        registrationError.value = null
      })
      PushNotifications.addListener('registrationError', (err) => {
        registrationError.value = err.error || 'Push registration failed'
      })
      // Spike-level handling only: confirm delivery and surface it for
      // manual inspection. No routing/display logic yet — that depends on
      // the not-yet-designed server-side alerting this is meant to unblock.
      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        lastReceived.value = notification
      })
      PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
        lastReceived.value = action.notification
      })

      await PushNotifications.register()
    } catch (e) {
      registrationError.value = String(e)
    }
  }

  return { token, registrationError, lastReceived, initialize }
}
