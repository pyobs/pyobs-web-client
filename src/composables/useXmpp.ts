import { ref, readonly } from 'vue'
import { Strophe, $pres } from 'strophe.js'

export type XmppStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const status = ref<XmppStatus>('disconnected')
const jid = ref<string>('')
const errorMessage = ref<string>('')
const modules = ref<string[]>([])

let connection: InstanceType<typeof Strophe.Connection> | null = null

function buildWsUrl(domain: string): string {
  // Derive WebSocket URL from XMPP domain.
  // ejabberd typically exposes ws(s)://<domain>:5280/ws
  // Override via VITE_XMPP_WS_URL env var for production.
  if (import.meta.env.VITE_XMPP_WS_URL) {
    return import.meta.env.VITE_XMPP_WS_URL as string
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${domain}:5280/ws`
}

export function useXmpp() {
  function connect(userJid: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      status.value = 'connecting'
      errorMessage.value = ''
      jid.value = userJid

      const domain = Strophe.getDomainFromJid(userJid)
      const wsUrl = buildWsUrl(domain)

      connection = new Strophe.Connection(wsUrl)

      connection.connect(userJid, password, (st: number) => {
        if (st === Strophe.Status.CONNECTED) {
          status.value = 'connected'
          connection!.send($pres())
          resolve()
        } else if (st === Strophe.Status.CONNFAIL) {
          status.value = 'error'
          errorMessage.value = 'Connection failed. Check server address and credentials.'
          reject(new Error('Connection failed'))
        } else if (st === Strophe.Status.AUTHFAIL) {
          status.value = 'error'
          errorMessage.value = 'Authentication failed. Check JID and password.'
          reject(new Error('Auth failed'))
        } else if (st === Strophe.Status.DISCONNECTED) {
          if (status.value === 'connected') {
            status.value = 'disconnected'
          }
        }
      })
    })
  }

  function disconnect() {
    if (connection) {
      connection.disconnect('logout')
      connection = null
    }
    status.value = 'disconnected'
    jid.value = ''
    modules.value = []
  }

  return {
    status: readonly(status),
    jid: readonly(jid),
    errorMessage: readonly(errorMessage),
    modules: readonly(modules),
    connect,
    disconnect,
  }
}
