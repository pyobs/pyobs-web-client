import { fileURLToPath, URL } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// Calling PushNotifications.register() without a real Firebase project
// configured crashes the whole app on Android — a native
// IllegalStateException ("Default FirebaseApp is not initialized") on a
// Capacitor plugin thread, unreachable from any JS try/catch. Baked in at
// build time (like __APP_VERSION__) since it depends on a file's presence,
// not runtime state — see usePushNotifications.ts.
const pushNotificationsConfigured = existsSync(
  new URL('./android/app/google-services.json', import.meta.url),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __PUSH_NOTIFICATIONS_CONFIGURED__: JSON.stringify(pushNotificationsConfigured),
  },
})
