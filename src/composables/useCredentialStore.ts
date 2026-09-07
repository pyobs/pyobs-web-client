import { SecureStorage } from '@aparajita/capacitor-secure-storage'

// Opt-in, per-JID password storage — Keychain-backed on iOS, Keystore-backed
// encrypted storage on Android (native builds), a plain (unencrypted) web
// fallback in the browser dev server. Never called unless the user explicitly
// checks "Remember password" — see LoginView.vue. Failures degrade to
// "no stored password" rather than blocking login, since this is a
// convenience layer on top of the always-available manual password entry.
const KEY_PREFIX = 'pw:'

// Same storage, same everything, for VFS endpoint bearer tokens (see
// useVfsConfig.ts — pyobs-core's HttpFile takes a single opt-in
// `Authorization: Bearer <token>` secret, not Basic Auth) — keyed per
// (bareJid, VFS root) since one account can have several configured
// endpoints. root/baseUrl aren't secrets and stay in useVfsConfig's plain
// localStorage, same as the XMPP JID staying outside this store while only
// its password moves in.
const VFS_KEY_PREFIX = 'vfstoken:'

function vfsKey(bareJid: string, root: string): string {
  return `${VFS_KEY_PREFIX}${bareJid}:${root}`
}

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

  async function getVfsToken(bareJid: string, root: string): Promise<string | null> {
    if (!bareJid || !root) return null
    try {
      const data = await SecureStorage.get(vfsKey(bareJid, root))
      return typeof data === 'string' ? data : null
    } catch {
      return null
    }
  }

  async function setVfsToken(bareJid: string, root: string, token: string): Promise<void> {
    if (!bareJid || !root) return
    try {
      await SecureStorage.set(vfsKey(bareJid, root), token)
    } catch {
      // best-effort, same reasoning as setPassword above
    }
  }

  async function removeVfsToken(bareJid: string, root: string): Promise<void> {
    if (!bareJid || !root) return
    try {
      await SecureStorage.remove(vfsKey(bareJid, root))
    } catch {
      // already gone, or storage unavailable — either way, nothing to do
    }
  }

  return {
    getPassword,
    setPassword,
    removePassword,
    getVfsToken,
    setVfsToken,
    removeVfsToken,
  }
}
