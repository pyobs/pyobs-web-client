import { describe, it, expect } from 'vitest'
import { humanizeParamName } from './paramLabel'

describe('humanizeParamName', () => {
  it('title-cases plain snake_case names', () => {
    expect(humanizeParamName('exposure_time')).toBe('Exposure Time')
    expect(humanizeParamName('image_type')).toBe('Image Type')
    expect(humanizeParamName('filter_name')).toBe('Filter Name')
    expect(humanizeParamName('left')).toBe('Left')
  })

  it('capitalizes single-letter names generically', () => {
    expect(humanizeParamName('x')).toBe('X')
    expect(humanizeParamName('y')).toBe('Y')
  })

  it('overrides astronomical/domain abbreviations', () => {
    expect(humanizeParamName('ra')).toBe('RA')
    expect(humanizeParamName('dalt')).toBe('Δ Alt')
    expect(humanizeParamName('daz')).toBe('Δ Az')
    expect(humanizeParamName('dra')).toBe('Δ RA')
    expect(humanizeParamName('ddec')).toBe('Δ Dec')
    expect(humanizeParamName('mu')).toBe('μ')
    expect(humanizeParamName('psi')).toBe('ψ')
    expect(humanizeParamName('fmt')).toBe('Format')
  })

  it('applies overrides per-word inside a compound name', () => {
    expect(humanizeParamName('ra_rate')).toBe('RA Rate')
  })
})
