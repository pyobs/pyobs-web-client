import { describe, it, expect } from 'vitest'
import { isMethodPermitted, allMethodsPermitted } from '../utils/acl'

describe('isMethodPermitted', () => {
  it('fails open (permitted) when undetermined', () => {
    expect(isMethodPermitted(undefined, 'init')).toBe(true)
  })

  it('denies everything for a real, successfully-fetched empty list', () => {
    expect(isMethodPermitted([], 'init')).toBe(false)
  })

  it('permits only listed methods once fetched', () => {
    const permitted = ['init', 'move_radec']
    expect(isMethodPermitted(permitted, 'init')).toBe(true)
    expect(isMethodPermitted(permitted, 'park')).toBe(false)
  })
})

describe('allMethodsPermitted', () => {
  it('fails open when undetermined', () => {
    expect(allMethodsPermitted(undefined, ['set_window', 'grab_data'])).toBe(true)
  })

  it('is permitted only if every method in the batch is', () => {
    expect(allMethodsPermitted(['set_window', 'grab_data'], ['set_window', 'grab_data'])).toBe(true)
    expect(allMethodsPermitted(['set_window'], ['set_window', 'grab_data'])).toBe(false)
  })

  it('an empty batch is vacuously permitted', () => {
    expect(allMethodsPermitted([], [])).toBe(true)
  })
})
