import { describe, it, expect } from 'vitest'
import { raDecToAltAz, altAzToRaDec, formatRaSexagesimal, formatDecSexagesimal, type GeoLocation } from './astroCoords'

// Fixtures generated from astropy's own ICRS<->AltAz transform (SkyCoord +
// AltAz frame, pressure=0 i.e. no refraction), run against pyobs-core's own
// astropy install — see the transform call this mirrors in
// ../../../pyobs-core/pyobs/modules/telescope/basetelescope.py. Not
// hand-invented: ../../specs/plans/2026-08-03-telescope-page.md documents how
// these were produced.
const LOCATION: GeoLocation = { longitudeDeg: 9.944722, latitudeDeg: 51.560583 }

// This transform deliberately omits nutation (~9-17") and aberration
// (~20"), both well under this tolerance — see astroCoords.ts's header.
const TOLERANCE_DEG = 0.02

const FORWARD_FIXTURES: Array<[ra: number, dec: number, iso: string, alt: number, az: number]> = [
  [83.633, 22.0145, '2026-09-07T22:00:00Z', 1.794978, 55.650657],
  [10.0, 60.0, '2026-09-07T22:00:00Z', 64.683814, 53.195762],
  [180.0, -20.0, '2026-09-07T22:00:00Z', -49.204311, 307.722263],
  [350.0, -70.0, '2026-09-07T22:00:00Z', -32.612238, 170.616369],
  [83.633, 22.0145, '2026-01-15T03:30:00Z', 15.276959, 286.34302],
  [10.0, 60.0, '2026-01-15T03:30:00Z', 22.223255, 352.882086],
  [180.0, -20.0, '2026-01-15T03:30:00Z', 18.236738, 176.751208],
  [350.0, -70.0, '2026-01-15T03:30:00Z', -71.437913, 172.804558],
  [83.633, 22.0145, '2030-06-21T12:00:00Z', 58.093522, 208.118445],
  [10.0, 60.0, '2030-06-21T12:00:00Z', 43.124925, 317.031076],
  [180.0, -20.0, '2030-06-21T12:00:00Z', -10.135695, 109.772093],
  [350.0, -70.0, '2030-06-21T12:00:00Z', -53.681388, 213.359252],
]

const INVERSE_FIXTURES: Array<[alt: number, az: number, iso: string, ra: number, dec: number]> = [
  [45.0, 90.0, '2026-09-07T22:00:00Z', 24.679577, 33.495042],
  [10.0, 270.0, '2026-09-07T22:00:00Z', 242.868462, 7.884316],
  [80.0, 0.0, '2026-09-07T22:00:00Z', 326.737287, 61.434202],
  [45.0, 90.0, '2026-01-15T03:30:00Z', 234.928726, 33.720437],
  [10.0, 270.0, '2026-01-15T03:30:00Z', 92.945418, 7.823636],
  [80.0, 0.0, '2026-01-15T03:30:00Z', 176.69093, 61.710876],
  [45.0, 90.0, '2030-06-21T12:00:00Z', 157.374762, 33.787634],
  [10.0, 270.0, '2030-06-21T12:00:00Z', 15.534988, 7.653135],
  [80.0, 0.0, '2030-06-21T12:00:00Z', 98.983283, 61.588304],
]

describe('raDecToAltAz', () => {
  it.each(FORWARD_FIXTURES)('ra=%s dec=%s at %s -> alt=%s az=%s (within tolerance)', (ra, dec, iso, alt, az) => {
    const result = raDecToAltAz({ raDeg: ra, decDeg: dec }, LOCATION, new Date(iso))
    expect(result.altDeg).toBeGreaterThan(alt - TOLERANCE_DEG)
    expect(result.altDeg).toBeLessThan(alt + TOLERANCE_DEG)
    expect(result.azDeg).toBeGreaterThan(az - TOLERANCE_DEG)
    expect(result.azDeg).toBeLessThan(az + TOLERANCE_DEG)
  })
})

describe('altAzToRaDec', () => {
  it.each(INVERSE_FIXTURES)('alt=%s az=%s at %s -> ra=%s dec=%s (within tolerance)', (alt, az, iso, ra, dec) => {
    const result = altAzToRaDec({ altDeg: alt, azDeg: az }, LOCATION, new Date(iso))
    expect(result.raDeg).toBeGreaterThan(ra - TOLERANCE_DEG)
    expect(result.raDeg).toBeLessThan(ra + TOLERANCE_DEG)
    expect(result.decDeg).toBeGreaterThan(dec - TOLERANCE_DEG)
    expect(result.decDeg).toBeLessThan(dec + TOLERANCE_DEG)
  })

  it('round-trips through raDecToAltAz', () => {
    const date = new Date('2026-09-07T22:00:00Z')
    const original = { raDeg: 123.456, decDeg: -35.2 }
    const altAz = raDecToAltAz(original, LOCATION, date)
    const back = altAzToRaDec(altAz, LOCATION, date)
    expect(back.raDeg).toBeCloseTo(original.raDeg, 6)
    expect(back.decDeg).toBeCloseTo(original.decDeg, 6)
  })
})

describe('formatRaSexagesimal', () => {
  it('formats the mockup fixture (83.8208° -> 05h 35m 17s)', () => {
    expect(formatRaSexagesimal(83.8208)).toBe('05h 35m 17s')
  })

  it('carries seconds into minutes on rounding', () => {
    // 0h 00m 59.6s of RA -> 0.2489(3)°, rounds up to 0h 01m 00s not 0h 00m 60s
    expect(formatRaSexagesimal(0.24833)).toBe('00h 01m 00s')
  })

  it('wraps 24h back to 0h', () => {
    // just under 360°, rounding the seconds pushes it to a full 24h
    expect(formatRaSexagesimal(359.9999999)).toBe('00h 00m 00s')
  })
})

describe('formatDecSexagesimal', () => {
  it('formats the mockup fixture (-5.3903° -> -05° 23\')', () => {
    expect(formatDecSexagesimal(-5.3903)).toBe("-05° 23'")
  })

  it('formats a positive declination with a leading +', () => {
    expect(formatDecSexagesimal(60.5)).toBe("+60° 30'")
  })

  it('carries arcminutes into degrees on rounding', () => {
    expect(formatDecSexagesimal(-5.993)).toBe("-06° 00'")
  })
})
