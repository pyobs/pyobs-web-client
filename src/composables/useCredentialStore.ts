import { SecureStorage } from '@aparajita/capacitor-secure-storage'

// Opt-in, per-JID password storage — Keychain-backed on iOS, Keystore-backed
// encrypted storage on Android (native builds), a plain (unencrypted) web
// fallback in the browser dev server. Never called unless the user explicitly
// checks "Remember password" — see LoginView.vue. Failures degrade to
// "no stored password" rather than blocking login, since this is a
// convenience layer on top of the always-available manual password entry.
const KEY_PREFIX = 'pw:'

export function useCredentialStore() {
  async function getPassword(bareJid: string): Promise<string | null> {
    if (!bareJid) return null
    try {
      const data = await SecureStorage.get(KEY_PREFIX + bareJid)
      return typeof data === 'string' ? data : null
    } catch {
      return null
    }
  }

  async function setPassword(bareJid: string, password: string): Promise<void> {
    if (!bareJid) return
    try {
      await SecureStorage.set(KEY_PREFIX + bareJid, password)
    } catch {
      // best-effort — a failed save shouldn't block a successful login
    }
  }

  async function removePassword(bareJid: string): Promise<void> {
    if (!bareJid) return
    try {
      await SecureStorage.remove(KEY_PREFIX + bareJid)
    } catch {
      // already gone, or storage unavailable — either way, nothing to do
    }
  }

  return { getPassword, setPassword, removePassword }
}
