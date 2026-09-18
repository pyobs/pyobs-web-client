import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import type { PyobsModule, RpcResult } from '../composables/useXmpp'

const modules = ref<PyobsModule[]>([])
const jid = ref('')
const executeMethod = vi.fn<(fullJid: string, method: string, params: unknown[], schema: unknown) => Promise<RpcResult>>()

vi.mock('@/composables/useXmpp', () => ({
  useXmpp: () => ({ modules, executeMethod, jid }),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    addListener: vi.fn(),
    register: vi.fn(),
  },
}))

// Imported after the mocks so usePushNotifications picks up the mocked useXmpp/Capacitor —
// same pattern as useVfsConfig.spec.ts.
const { usePushNotifications } = await import('../composables/usePushNotifications')

// register_push_device()'s real schema shape (pyobs-core's IPushNotifications interface) — enough
// of PyobsModule for the registration watcher to act on, not a full fixture.
function moduleWithPushNotifications(jid: string): PyobsModule {
  return {
    jid,
    fullJid: `${jid}/pyobs`,
    name: jid,
    interfaces: {
      IPushNotifications: {
        name: 'IPushNotifications',
        version: 1,
        enums: {},
        structs: {},
        commands: {
          register_push_device: {
            name: 'register_push_device',
            params: [
              { name: 'token', type: 'string' },
              { name: 'platform', type: 'string' },
            ],
          },
        },
        state: null,
      },
    },
    events: {},
    capabilities: {},
  }
}

function moduleWithoutPushNotifications(jid: string): PyobsModule {
  return { ...moduleWithPushNotifications(jid), interfaces: {} }
}

// The v2 shape: register + get/set preferences + the PushNotificationType enum (pyobs-core's
// IPushNotifications after the push-prefixed rename).
function moduleWithPushPreferences(jid: string): PyobsModule {
  const base = moduleWithPushNotifications(jid)
  const iface = base.interfaces['IPushNotifications']!
  return {
    ...base,
    interfaces: {
      IPushNotifications: {
        ...iface,
        enums: { PushNotificationType: ['module_error', 'log_error', 'log_critical'] },
        commands: {
          ...iface.commands,
          get_push_preferences: { name: 'get_push_preferences', params: [] },
          set_push_preferences: {
            name: 'set_push_preferences',
            params: [
              { name: 'types', type: { kind: 'array', item: { kind: 'enum', name: 'PushNotificationType' } } },
            ],
          },
        },
      },
    },
  }
}

// usePushNotifications' prefs store is a module-level singleton, so clearing localStorage between
// tests doesn't reset it — give every test its own bare JID instead (same trick as
// useVfsConfig.spec.ts).
let userCounter = 0
function freshBareJid(): string {
  return `user${userCounter++}@localhost`
}
function freshJid(): string {
  return `${freshBareJid()}/pyobs`
}

beforeEach(() => {
  localStorage.clear()
  modules.value = []
  jid.value = ''
  usePushNotifications().token.value = null
  executeMethod.mockReset()
  executeMethod.mockResolvedValue({ success: true, value: null })
})

describe('usePushNotifications — server-side device registration', () => {
  it('does nothing when no module advertises IPushNotifications, even with a token', async () => {
    const { token } = usePushNotifications()
    modules.value = [moduleWithoutPushNotifications('camera@localhost')]
    token.value = 'device-token-1'
    await Promise.resolve()
    expect(executeMethod).not.toHaveBeenCalled()
  })

  it('does nothing while there is no token, even with a matching module', async () => {
    modules.value = [moduleWithPushNotifications('pushnotifier@localhost')]
    await Promise.resolve()
    expect(executeMethod).not.toHaveBeenCalled()
  })

  it('registers once a matching module and a token both exist', async () => {
    const { token } = usePushNotifications()
    token.value = 'device-token-2'
    modules.value = [moduleWithPushNotifications('pushnotifier@localhost')]
    await Promise.resolve()

    expect(executeMethod).toHaveBeenCalledTimes(1)
    expect(executeMethod).toHaveBeenCalledWith(
      'pushnotifier@localhost/pyobs',
      'register_push_device',
      ['device-token-2', 'android'],
      expect.objectContaining({ name: 'register_push_device' }),
    )
  })

  it('does not re-register the same token with the same module twice', async () => {
    const { token } = usePushNotifications()
    token.value = 'device-token-3'
    modules.value = [moduleWithPushNotifications('pushnotifier@localhost')]
    await Promise.resolve()
    expect(executeMethod).toHaveBeenCalledTimes(1)

    // module list mutates for an unrelated reason (e.g. another module coming online) —
    // the already-registered (module, token) pair must not fire again.
    modules.value = [...modules.value, moduleWithoutPushNotifications('camera@localhost')]
    await Promise.resolve()
    expect(executeMethod).toHaveBeenCalledTimes(1)
  })

  it('retries on the next module-list change after a failed registration', async () => {
    const { token } = usePushNotifications()
    executeMethod.mockResolvedValueOnce({ success: false, value: 'RemoteError' })
    token.value = 'device-token-4'
    modules.value = [moduleWithPushNotifications('pushnotifier@localhost')]
    await Promise.resolve()
    expect(executeMethod).toHaveBeenCalledTimes(1)

    modules.value = [...modules.value]
    await Promise.resolve()
    expect(executeMethod).toHaveBeenCalledTimes(2)
  })
})

describe('usePushNotifications — notification-type preferences', () => {
  it('reads the account selection on connect with get_push_preferences', async () => {
    const { preferences } = usePushNotifications()
    jid.value = freshJid()
    executeMethod.mockResolvedValueOnce({ success: true, value: ['log_error'] })
    modules.value = [moduleWithPushPreferences('pushnotifier@localhost')]

    await vi.waitFor(() =>
      expect(executeMethod).toHaveBeenCalledWith(
        'pushnotifier@localhost/pyobs',
        'get_push_preferences',
        [],
        expect.objectContaining({ name: 'get_push_preferences' }),
      ),
    )
    await vi.waitFor(() => expect(preferences.value).toEqual(['log_error']))
  })

  it('exposes the advertised enum values as the full toggle set', async () => {
    const { notificationTypes, preferences } = usePushNotifications()
    jid.value = freshJid()
    executeMethod.mockResolvedValueOnce({
      success: true,
      value: ['module_error', 'log_error', 'log_critical'],
    })
    modules.value = [moduleWithPushPreferences('pushnotifier@localhost')]

    expect(notificationTypes.value).toEqual(['module_error', 'log_error', 'log_critical'])
    await vi.waitFor(() => expect(preferences.value).toEqual(notificationTypes.value))
  })

  it('does not touch preferences against a v1 module (register only)', async () => {
    jid.value = freshJid()
    modules.value = [moduleWithPushNotifications('pushnotifier@localhost')]
    await Promise.resolve()
    expect(executeMethod).not.toHaveBeenCalled()
  })

  it('writes the new selection on toggle', async () => {
    const { preferences, setTypeEnabled } = usePushNotifications()
    jid.value = freshJid()
    executeMethod.mockResolvedValueOnce({
      success: true,
      value: ['module_error', 'log_error', 'log_critical'],
    })
    modules.value = [moduleWithPushPreferences('pushnotifier@localhost')]
    await vi.waitFor(() => expect(preferences.value).toHaveLength(3))
    executeMethod.mockClear()

    setTypeEnabled('log_error', false)

    expect(preferences.value).toEqual(['module_error', 'log_critical'])
    expect(executeMethod).toHaveBeenCalledWith(
      'pushnotifier@localhost/pyobs',
      'set_push_preferences',
      [['module_error', 'log_critical']],
      expect.objectContaining({ name: 'set_push_preferences' }),
    )
  })

  it('can opt out of everything with an empty selection', async () => {
    const { preferences, setTypeEnabled } = usePushNotifications()
    jid.value = freshJid()
    executeMethod.mockResolvedValueOnce({
      success: true,
      value: ['module_error', 'log_error', 'log_critical'],
    })
    modules.value = [moduleWithPushPreferences('pushnotifier@localhost')]
    await vi.waitFor(() => expect(preferences.value).toHaveLength(3))
    executeMethod.mockClear()

    setTypeEnabled('module_error', false)
    setTypeEnabled('log_error', false)
    setTypeEnabled('log_critical', false)

    expect(preferences.value).toEqual([])
    expect(executeMethod).toHaveBeenLastCalledWith(
      'pushnotifier@localhost/pyobs',
      'set_push_preferences',
      [[]],
      expect.objectContaining({ name: 'set_push_preferences' }),
    )
  })

  it('re-reads the selection when a write fails', async () => {
    const { setTypeEnabled } = usePushNotifications()
    jid.value = freshJid()
    executeMethod.mockResolvedValueOnce({ success: true, value: ['module_error'] })
    modules.value = [moduleWithPushPreferences('pushnotifier@localhost')]
    await vi.waitFor(() => expect(executeMethod).toHaveBeenCalledTimes(1))
    executeMethod.mockClear()
    executeMethod.mockResolvedValueOnce({ success: false, value: 'RemoteError' }) // the write
    executeMethod.mockResolvedValueOnce({ success: true, value: ['module_error'] }) // the re-read

    setTypeEnabled('log_error', true)

    await vi.waitFor(() =>
      expect(executeMethod).toHaveBeenCalledWith(
        'pushnotifier@localhost/pyobs',
        'get_push_preferences',
        [],
        expect.objectContaining({ name: 'get_push_preferences' }),
      ),
    )
  })

  it('keys the cached selection per account', async () => {
    const { preferences } = usePushNotifications()
    const jidA = freshBareJid()
    const jidB = freshBareJid()

    jid.value = `${jidA}/pyobs`
    executeMethod.mockResolvedValueOnce({ success: true, value: ['log_error'] })
    modules.value = [moduleWithPushPreferences('pushnotifier@localhost')]
    await vi.waitFor(() => expect(preferences.value).toEqual(['log_error']))

    executeMethod.mockResolvedValueOnce({ success: true, value: ['module_error'] })
    jid.value = `${jidB}/pyobs`
    await vi.waitFor(() => expect(preferences.value).toEqual(['module_error']))

    const persisted = JSON.parse(localStorage.getItem('pyobs_push_preferences')!)
    expect(persisted[jidA]).toEqual(['log_error'])
    expect(persisted[jidB]).toEqual(['module_error'])
  })
})
