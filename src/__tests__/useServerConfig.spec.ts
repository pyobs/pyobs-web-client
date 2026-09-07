import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useServerConfig } from '../composables/useServerConfig'

// useServerConfig's store is a module-level singleton (same pattern as useXmpp/
// useVfsConfig), so it isn't reset by clearing localStorage between tests — give
// every test its own domain instead, so cases can't leak state into one another.
let domainCounter = 0
function freshDomain(): string {
  return `server${domainCounter++}.example.com`
}

beforeEach(() => {
  localStorage.clear()
})

describe('useServerConfig', () => {
  it('has no override for an unconfigured domain', () => {
    const { getForceSecure } = useServerConfig()
    expect(getForceSecure(freshDomain())).toBeUndefined()
  })

  it('sets and persists a forceSecure override, keyed by domain', () => {
    const domain = freshDomain()
    const other = freshDomain()
    const { getForceSecure, setForceSecure } = useServerConfig()

    setForceSecure(domain, true)
    expect(getForceSecure(domain)).toBe(true)
    expect(getForceSecure(other)).toBeUndefined()

    const persisted = JSON.parse(localStorage.getItem('pyobs_server_config')!)
    expect(persisted[domain]).toEqual({ forceSecure: true })
  })

  it('migrates the pre-port storage format (a bare boolean per domain)', async () => {
    const domain = freshDomain()
    localStorage.setItem('pyobs_server_config', JSON.stringify({ [domain]: true }))

    // The store is a module-level singleton loaded once at import time, so
    // reset the module registry and re-import to exercise loadStore() fresh
    // against the legacy value just written.
    vi.resetModules()
    const { useServerConfig: freshUseServerConfig } = await import('../composables/useServerConfig')
    const { getForceSecure } = freshUseServerConfig()
    expect(getForceSecure(domain)).toBe(true)
  })

  it('sets and persists a port override, independent of forceSecure', () => {
    const domain = freshDomain()
    const { getPort, setPort, getForceSecure, setForceSecure } = useServerConfig()

    setForceSecure(domain, false)
    setPort(domain, 443)

    expect(getPort(domain)).toBe(443)
    expect(getForceSecure(domain)).toBe(false)
  })

  it('clears a port override back to "no override" without touching forceSecure', () => {
    const domain = freshDomain()
    const { getPort, setPort, getForceSecure, setForceSecure } = useServerConfig()

    setForceSecure(domain, true)
    setPort(domain, 5281)
    setPort(domain, undefined)

    expect(getPort(domain)).toBeUndefined()
    expect(getForceSecure(domain)).toBe(true)
  })

  it('ignores setting a port override for an empty domain', () => {
    const { getPort, setPort } = useServerConfig()

    setPort('', 443)
    expect(getPort('')).toBeUndefined()
  })

  it('clears an override back to "no override" (undefined), not false', () => {
    const domain = freshDomain()
    const { getForceSecure, setForceSecure, clearOverride } = useServerConfig()

    setForceSecure(domain, true)
    clearOverride(domain)
    expect(getForceSecure(domain)).toBeUndefined()
  })

  it('keeps overrides isolated per domain', () => {
    const secure = freshDomain()
    const insecure = freshDomain()
    const { getForceSecure, setForceSecure } = useServerConfig()

    setForceSecure(secure, true)
    setForceSecure(insecure, false)

    expect(getForceSecure(secure)).toBe(true)
    expect(getForceSecure(insecure)).toBe(false)
  })

  it('ignores setting an override for an empty domain', () => {
    const { getForceSecure, setForceSecure } = useServerConfig()

    setForceSecure('', true)
    expect(getForceSecure('')).toBeUndefined()
  })
})
