import { describe, it, expect, beforeEach } from 'vitest'
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
    expect(persisted[domain]).toBe(true)
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
