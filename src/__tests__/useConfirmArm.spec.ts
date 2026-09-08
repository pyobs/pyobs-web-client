import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useConfirmArm } from '../composables/useConfirmArm'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useConfirmArm', () => {
  it('starts with nothing armed', () => {
    const { isArmed } = useConfirmArm()
    expect(isArmed('park')).toBe(false)
  })

  it('arms on the first call and returns false (caller should not act yet)', () => {
    const { isArmed, confirm } = useConfirmArm()
    expect(confirm('park')).toBe(false)
    expect(isArmed('park')).toBe(true)
  })

  it('disarms and returns true on a second call for the same key within the window', () => {
    const { isArmed, confirm } = useConfirmArm(3000)
    confirm('park')
    vi.advanceTimersByTime(1000)
    expect(confirm('park')).toBe(true)
    expect(isArmed('park')).toBe(false)
  })

  it('auto-disarms after the timeout with no second tap', () => {
    const { isArmed, confirm } = useConfirmArm(3000)
    confirm('park')
    vi.advanceTimersByTime(3001)
    expect(isArmed('park')).toBe(false)
    // A "confirm" after the timeout is a fresh arm, not a fire — matches a
    // real second tap arriving too late to count as confirmation.
    expect(confirm('park')).toBe(false)
    expect(isArmed('park')).toBe(true)
  })

  it('arming a different key disarms the previous one — only one at a time', () => {
    const { isArmed, confirm } = useConfirmArm()
    confirm('park')
    expect(isArmed('park')).toBe(true)
    confirm('init')
    expect(isArmed('park')).toBe(false)
    expect(isArmed('init')).toBe(true)
  })

  it('disarm() clears the armed key immediately', () => {
    const { isArmed, confirm, disarm } = useConfirmArm()
    confirm('park')
    disarm()
    expect(isArmed('park')).toBe(false)
  })
})
