import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import type { PyobsModule, RpcResult } from '../composables/useXmpp'

const modules = ref<PyobsModule[]>([])
const executeMethod = vi.fn<(fullJid: string, method: string, params: unknown[], schema: unknown) => Promise<RpcResult>>()

vi.mock('@/composables/useXmpp', () => ({
  useXmpp: () => ({ modules, executeMethod }),
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

beforeEach(() => {
  modules.value = []
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
