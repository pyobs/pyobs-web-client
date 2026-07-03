import { ref, readonly, computed, type ComputedRef } from 'vue'
import { Strophe, $pres, $iq } from 'strophe.js'
import {
  localTag,
  xmlToValue,
  valueToXml,
  createNamespacedElement,
  parseVersionedFeature,
  parseInterfaceSchema,
  parseEventSchema,
  type InterfaceSchema,
  type EventSchema,
  type CommandSchema,
} from '@/pyobs-codec'

export type XmppStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type PyobsModule = {
  jid: string // bare JID, e.g. camera@localhost
  fullJid: string // full JID with resource, e.g. camera@localhost/pyobs
  name: string
  interfaces: Record<string, InterfaceSchema>
  events: Record<string, EventSchema>
  capabilities: Record<string, Record<string, unknown>> // interface name -> decoded capabilities
}

export type RpcResult = {
  success: boolean
  value: unknown
  errorClass?: string
}

export type PyobsEvent = {
  type: string
  module: string
  timestamp: number
  uuid: string
  data: Record<string, unknown>
}

const NS_DISCO_INFO = 'http://jabber.org/protocol/disco#info'
const NS_PUBSUB = 'http://jabber.org/protocol/pubsub'
const NS_PUBSUB_EVENT = 'http://jabber.org/protocol/pubsub#event'
const NS_RPC = 'jabber:iq:rpc'
const NS_PYOBS_RPC = 'urn:pyobs:rpc:1'
const NS_ROSTER = 'jabber:iq:roster'
const PYOBS_RESOURCE = 'pyobs'
const SESSION_JID_KEY = 'xmpp_jid'
const SESSION_PW_KEY = 'xmpp_password'
const MAX_EVENTS = 500
const STATE_SUBSCRIBE_RETRIES = 30
const STATE_SUBSCRIBE_RETRY_WAIT_MS = 1000

// Start as 'connecting' immediately if credentials are stored so the first
// render never shows the login screen before the auto-reconnect kicks in.
const status = ref<XmppStatus>(
  sessionStorage.getItem(SESSION_JID_KEY) && sessionStorage.getItem(SESSION_PW_KEY)
    ? 'connecting'
    : 'disconnected',
)
const jid = ref<string>('')
const errorMessage = ref<string>('')
const modules = ref<PyobsModule[]>([])
const events = ref<PyobsEvent[]>([])

// PubSub state: keyed by the real "pyobs:state:{module}:{Interface}:{version}"
// node string. Ref-counted since ejabberd tracks one real subscription per
// (JID, node) — multiple components watching the same module/interface must
// not each send their own subscribe/unsubscribe IQ.
const stateStore = ref<Map<string, unknown>>(new Map())
const stateRefCounts = new Map<string, number>()
const stateSubscribing = new Set<string>()

let connection: InstanceType<typeof Strophe.Connection> | null = null
let connectionGeneration = 0

function buildWsUrl(domain: string): string {
  if (import.meta.env.VITE_XMPP_WS_URL) {
    return import.meta.env.VITE_XMPP_WS_URL as string
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${domain}:5280/ws`
}

function sendIQ(stanza: Element): Promise<Element> {
  return new Promise((resolve, reject) => {
    connection!.sendIQ(stanza, resolve, reject, 10000)
  })
}

function pubsubServiceFor(bareJid: string): string {
  return `pubsub.${Strophe.getDomainFromJid(bareJid)}`
}

// ── module discovery: one disco#info query returns everything ──────────────
// (interface schemas — commands/state/types — plus capabilities), per
// pyobs-core 2.0's `_get_disco_info`. Nothing is pre-generated; the schema is
// whatever this specific module actually publishes.

async function fetchModuleInfo(bareJid: string, fullJid: string): Promise<void> {
  let name = Strophe.getNodeFromJid(bareJid) ?? bareJid
  const interfaces: Record<string, InterfaceSchema> = {}
  const eventSchemas: Record<string, EventSchema> = {}
  const capabilities: Record<string, Record<string, unknown>> = {}

  try {
    const result = await sendIQ(
      $iq({ to: fullJid, type: 'get' })
        .c('query', { xmlns: NS_DISCO_INFO })
        .tree(),
    )
    const identities = Array.from(result.getElementsByTagName('identity'))
    name = identities[0]?.getAttribute('name') ?? name

    const query = result.getElementsByTagName('query')[0]
    for (const child of Array.from(query?.children ?? [])) {
      const ns = child.namespaceURI ?? ''
      const tag = localTag(child)
      if (tag === 'interface' && ns.startsWith('urn:pyobs:interface:')) {
        const schema = parseInterfaceSchema(child)
        interfaces[schema.name] = schema
      } else if (tag === 'event' && ns.startsWith('urn:pyobs:event:')) {
        const schema = parseEventSchema(child)
        eventSchemas[schema.name] = schema
      } else if (tag === 'capabilities' && ns.startsWith('urn:pyobs:capabilities:')) {
        const ref = parseVersionedFeature('capabilities', ns)
        if (ref) capabilities[ref.name] = xmlToValue(child) as Record<string, unknown>
      }
    }
  } catch {
    // use defaults derived from JID
  }

  modules.value = [
    ...modules.value.filter((m) => m.jid !== bareJid),
    { jid: bareJid, fullJid, name, interfaces, events: eventSchemas, capabilities },
  ]

  // Subscribe to every event this module publishes (PEP — hosted on the
  // module's own bare JID, not a separate pubsub service, unlike state below).
  const myBareJid = Strophe.getBareJidFromJid(jid.value)
  for (const schema of Object.values(eventSchemas)) {
    const node = `urn:pyobs:event:${schema.name}:${schema.version}`
    sendIQ(
      $iq({ to: bareJid, type: 'set' })
        .c('pubsub', { xmlns: NS_PUBSUB })
        .c('subscribe', { node, jid: myBareJid })
        .tree(),
    ).catch(() => {})
  }
}

// A newly-connected session only learns about modules from presence *pushes*
// (handlePresence, below) — it has no way to find out about a module that was
// already online before this session existed, unless the server auto-probes
// roster contacts on our behalf (not guaranteed across every ejabberd setup,
// see DEVELOPMENT.md). Fix: explicitly probe every roster contact ourselves
// right after connecting. Responses come back as ordinary presence stanzas
// and are handled by the same handlePresence path as any live push.
async function probeRosterPresence(): Promise<void> {
  try {
    const result = await sendIQ($iq({ type: 'get' }).c('query', { xmlns: NS_ROSTER }).tree())
    for (const item of Array.from(result.getElementsByTagName('item'))) {
      const bareJid = item.getAttribute('jid')
      if (bareJid) connection!.send($pres({ to: bareJid, type: 'probe' }))
    }
  } catch {
    // no roster available — nothing to probe
  }
}

function handlePresence(presence: Element): boolean {
  const from = presence.getAttribute('from')
  if (!from) return true

  // pyobs modules always connect with resource "pyobs"
  if (Strophe.getResourceFromJid(from) !== PYOBS_RESOURCE) return true

  const type = presence.getAttribute('type') ?? 'available'
  const bareJid = Strophe.getBareJidFromJid(from)

  if (type === 'unavailable') {
    modules.value = modules.value.filter((m) => m.jid !== bareJid)
  } else {
    fetchModuleInfo(bareJid, from)
  }

  return true // keep handler active
}

// ── PubSub message handler (events + state pushes) ─────────────────────────

function handleStateNotification(node: string, itemsEl: Element): void {
  const itemEl = Array.from(itemsEl.children).find((c) => localTag(c) === 'item')
  const payloadEl = itemEl?.firstElementChild
  if (!payloadEl) return
  const next = new Map(stateStore.value)
  next.set(node, xmlToValue(payloadEl))
  stateStore.value = next
}

function handlePubsubMessage(message: Element): boolean {
  const eventEl = Array.from(message.children).find(
    (el) => el.localName === 'event' && el.getAttribute('xmlns') === NS_PUBSUB_EVENT,
  )
  if (!eventEl) return true

  const itemsEl = eventEl.getElementsByTagName('items')[0]
  if (!itemsEl) return true

  const node = itemsEl.getAttribute('node') ?? ''

  if (node.startsWith('pyobs:state:')) {
    handleStateNotification(node, itemsEl)
    return true
  }

  if (!node.startsWith('urn:pyobs:event:')) return true

  const payloadEl = Array.from(itemsEl.children).find((c) => localTag(c) === 'item')?.firstElementChild
  if (!payloadEl) return true

  try {
    const raw = JSON.parse(payloadEl.textContent ?? '{}')
    const ref = parseVersionedFeature('event', node)
    const ev: PyobsEvent = {
      type: raw.type ?? ref?.name ?? node,
      module: Strophe.getNodeFromJid(message.getAttribute('from') ?? '') ?? message.getAttribute('from') ?? '?',
      timestamp: raw.timestamp ?? Date.now() / 1000,
      uuid: raw.uuid ?? '',
      data: raw.data ?? {},
    }
    events.value = [...events.value.slice(-(MAX_EVENTS - 1)), ev]
  } catch {
    // malformed payload — ignore
  }

  return true
}

// ── XEP-0009 RPC (urn:pyobs:rpc:1 payload encoding) ─────────────────────────

function findRpcFault(result: Element): { exception: string; message: string } | null {
  const outerFault = result.getElementsByTagName('fault')[0]
  if (!outerFault) return null
  const outerValue = Array.from(outerFault.children).find((c) => localTag(c) === 'value')
  const innerFault = outerValue ? Array.from(outerValue.children).find((c) => localTag(c) === 'fault') : undefined
  const exceptionEl = innerFault ? Array.from(innerFault.children).find((c) => localTag(c) === 'exception') : undefined
  const messageEl = innerFault ? Array.from(innerFault.children).find((c) => localTag(c) === 'message') : undefined
  return {
    exception: exceptionEl?.textContent ?? 'RemoteError',
    message: messageEl?.textContent ?? '',
  }
}

function parseRpcReturn(result: Element): unknown {
  const paramsEl = result.getElementsByTagName('params')[0]
  const paramEl = paramsEl?.children[0]
  if (!paramEl) return null // void return: empty <params/>
  const outerValueEl = Array.from(paramEl.children).find((c) => localTag(c) === 'value')
  const innerValueEl = outerValueEl
    ? Array.from(outerValueEl.children).find((c) => localTag(c) === 'value' && c.namespaceURI === NS_PYOBS_RPC)
    : undefined
  const contentEl = innerValueEl?.firstElementChild
  return contentEl ? xmlToValue(contentEl) : null
}

async function executeMethod(fullJid: string, methodName: string, params: unknown[], schema: CommandSchema): Promise<RpcResult> {
  if (!connection) throw new Error('Not connected')

  const builder = $iq({ to: fullJid, type: 'set' })
    .c('query', { xmlns: NS_RPC })
    .c('methodCall')
    .c('methodName')
    .t(methodName)
    .up()
    .c('params')

  schema.params.forEach((paramSchema, i) => {
    const contentEl = valueToXml(params[i], paramSchema.type)
    const pyobsValue = createNamespacedElement(NS_PYOBS_RPC, 'value')
    pyobsValue.appendChild(contentEl)
    builder.c('param').c('value').cnode(pyobsValue).up().up().up()
  })

  let result: Element
  try {
    result = await sendIQ(builder.tree())
  } catch (err: unknown) {
    // XMPP-level error (item-not-found, forbidden, …)
    const msg = err instanceof Element
      ? (err.getElementsByTagName('text')[0]?.textContent ?? 'XMPP error')
      : String(err)
    return { success: false, value: msg }
  }

  const fault = findRpcFault(result)
  if (fault) {
    return { success: false, value: fault.message, errorClass: fault.exception }
  }

  return { success: true, value: parseRpcReturn(result) }
}

// ── state subscription (reference-counted, mirrors XmppComm's own model) ───

function stateNode(moduleUsername: string, interfaceName: string, version: number): string {
  return `pyobs:state:${moduleUsername}:${interfaceName}:${version}`
}

async function subscribeWithRetry(bareJid: string, node: string): Promise<void> {
  const pubsubService = pubsubServiceFor(bareJid)
  const myBareJid = Strophe.getBareJidFromJid(jid.value)

  for (let attempt = 0; attempt < STATE_SUBSCRIBE_RETRIES; attempt++) {
    try {
      await sendIQ(
        $iq({ to: pubsubService, type: 'set' })
          .c('pubsub', { xmlns: NS_PUBSUB })
          .c('subscribe', { node, jid: myBareJid })
          .tree(),
      )
      break
    } catch {
      // publisher may not have created the node yet — wait and retry
      await new Promise((r) => setTimeout(r, STATE_SUBSCRIBE_RETRY_WAIT_MS))
    }
  }

  // Fetch the current value in case a live push races the subscribe ack.
  try {
    const result = await sendIQ(
      $iq({ to: pubsubService, type: 'get' })
        .c('pubsub', { xmlns: NS_PUBSUB })
        .c('items', { node, max_items: '1' })
        .tree(),
    )
    const itemEl = Array.from(result.getElementsByTagName('items')[0]?.children ?? []).find(
      (c) => localTag(c) === 'item',
    )
    const payloadEl = itemEl?.firstElementChild
    if (payloadEl) {
      const next = new Map(stateStore.value)
      next.set(node, xmlToValue(payloadEl))
      stateStore.value = next
    }
  } catch {
    // no current value published yet
  }
}

function subscribeState(bareJid: string, interfaceName: string, version: number): { value: ComputedRef<unknown>; unsubscribe: () => void } {
  const moduleUsername = Strophe.getNodeFromJid(bareJid) ?? bareJid
  const node = stateNode(moduleUsername, interfaceName, version)

  stateRefCounts.set(node, (stateRefCounts.get(node) ?? 0) + 1)
  if (!stateSubscribing.has(node)) {
    stateSubscribing.add(node)
    subscribeWithRetry(bareJid, node)
  }

  const value = computed(() => stateStore.value.get(node))

  let unsubscribed = false
  const unsubscribe = () => {
    if (unsubscribed) return
    unsubscribed = true
    const remaining = (stateRefCounts.get(node) ?? 1) - 1
    if (remaining <= 0) {
      stateRefCounts.delete(node)
      stateSubscribing.delete(node)
      const pubsubService = pubsubServiceFor(bareJid)
      const myBareJid = Strophe.getBareJidFromJid(jid.value)
      sendIQ(
        $iq({ to: pubsubService, type: 'set' })
          .c('pubsub', { xmlns: NS_PUBSUB })
          .c('unsubscribe', { node, jid: myBareJid })
          .tree(),
      ).catch(() => {})
    } else {
      stateRefCounts.set(node, remaining)
    }
  }

  return { value, unsubscribe }
}

// ── connection management ─────────────────────────────────────────────────

function connect(userJid: string, password: string, silent = false): Promise<void> {
  const myGeneration = ++connectionGeneration
  return new Promise((resolve, reject) => {
    status.value = 'connecting'
    errorMessage.value = ''
    jid.value = userJid

    const domain = Strophe.getDomainFromJid(userJid)
    const wsUrl = buildWsUrl(domain)

    connection = new Strophe.Connection(wsUrl)

    connection.connect(userJid, password, (st: number) => {
      // Ignore callbacks from a superseded connection attempt.
      if (myGeneration !== connectionGeneration) return

      if (st === Strophe.Status.CONNECTED) {
        status.value = 'connected'
        sessionStorage.setItem(SESSION_JID_KEY, userJid)
        sessionStorage.setItem(SESSION_PW_KEY, password)
        // Register presence handler before sending initial presence so the
        // server's roster-presence flood is captured on arrival
        connection!.addHandler(handlePresence, '', 'presence', '')
        connection!.addHandler(handlePubsubMessage, NS_PUBSUB_EVENT, 'message', '')
        connection!.send($pres())
        probeRosterPresence()
        resolve()
      } else if (st === Strophe.Status.CONNFAIL) {
        // Transient failure — keep credentials so a retry can succeed.
        // In silent mode (auto-reconnect) keep spinner up; otherwise show error.
        if (!silent) {
          status.value = 'error'
          errorMessage.value = 'Connection failed. Check server address.'
        }
        reject(new Error('Connection failed'))
      } else if (st === Strophe.Status.AUTHFAIL) {
        // Wrong password — credentials are definitely bad, clear them.
        status.value = 'error'
        errorMessage.value = 'Authentication failed. Check JID and password.'
        sessionStorage.removeItem(SESSION_JID_KEY)
        sessionStorage.removeItem(SESSION_PW_KEY)
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
  sessionStorage.removeItem(SESSION_JID_KEY)
  sessionStorage.removeItem(SESSION_PW_KEY)
  if (connection) {
    connection.disconnect('logout')
    connection = null
  }
  status.value = 'disconnected'
  jid.value = ''
  modules.value = []
  events.value = []
  stateStore.value = new Map()
  stateRefCounts.clear()
  stateSubscribing.clear()
}

// Restore session automatically on page reload, with one retry after 1 s in
// case ejabberd is still tearing down the previous WebSocket session.
async function autoReconnect(savedJid: string, savedPassword: string): Promise<void> {
  try {
    await connect(savedJid, savedPassword, true)
  } catch {
    // First attempt failed — wait 1 s (ejabberd cleaning up old session) then retry.
    await new Promise((r) => setTimeout(r, 1000))
    if (sessionStorage.getItem(SESSION_JID_KEY)) {
      await connect(savedJid, savedPassword, true).catch(() => {
        // Both attempts failed; let the user log in manually.
        status.value = 'disconnected'
      })
    }
  }
}

const storedJid = sessionStorage.getItem(SESSION_JID_KEY)
const storedPassword = sessionStorage.getItem(SESSION_PW_KEY)
if (storedJid && storedPassword) {
  autoReconnect(storedJid, storedPassword)
}

export function useXmpp() {
  return {
    status: readonly(status),
    jid: readonly(jid),
    errorMessage: readonly(errorMessage),
    modules: readonly(modules),
    events: readonly(events),
    connect,
    disconnect,
    executeMethod,
    subscribeState,
    clearEvents: () => { events.value = [] },
  }
}
