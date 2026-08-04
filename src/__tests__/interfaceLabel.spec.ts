import { describe, it, expect } from 'vitest'
import { interfaceLabel } from '@/utils/interfaceLabel'

describe('interfaceLabel', () => {
  it('strips the leading I for single-word interfaces', () => {
    expect(interfaceLabel('IRoof')).toBe('Roof')
    expect(interfaceLabel('IMode')).toBe('Mode')
  })

  it('splits camelCase interface names into words', () => {
    expect(interfaceLabel('IStructuredConfig')).toBe('Structured Config')
  })
})
