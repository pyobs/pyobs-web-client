// Approximate RA/Dec (ICRS) <-> Alt/Az transform, for the Telescope page's
// destination preview only ("where does this typed coordinate actually
// point to right now") — NOT used for actual pointing, which the server
// (pyobs-core, via astropy) does authoritatively. `move_radec`'s ra/dec is
// ICRS (see `../pyobs-core/pyobs/modules/telescope/basetelescope.py`, every
// SkyCoord there is `frame="icrs"`/`frame=ICRS`), which is ~J2000 mean
// equator/equinox — precession alone would otherwise misplace the preview
// by ~20 arcmin today, growing with time, so it's included; nutation (~9-17")
// and aberration (~20") are not, both far under this preview's target
// precision. Method: mean sidereal time (IAU 1982 GMST) + IAU 1976
// low-precision precession (Meeus, "Astronomical Algorithms" ch. 11 & 21).
// Verified against astropy's full ICRS<->AltAz transform to within ~0.01°
// across several epochs — see astroCoords.spec.ts.

export type GeoLocation = { longitudeDeg: number; latitudeDeg: number }
export type RaDec = { raDeg: number; decDeg: number }
export type AltAz = { altDeg: number; azDeg: number }

const DEG = Math.PI / 180
const ARCSEC = 1 / 3600

function norm360(deg: number): number {
  const r = deg % 360
  return r < 0 ? r + 360 : r
}

function julianDate(date: Date): number {
  // Unix epoch (1970-01-01T00:00:00 UTC) is JD 2440587.5 — exact, no
  // Gregorian-calendar arithmetic needed since Date.getTime() is already
  // UTC milliseconds.
  return date.getTime() / 86400000 + 2440587.5
}

// Greenwich Mean Sidereal Time, in degrees (IAU 1982 formula).
function gmstDeg(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0
  return norm360(gmst)
}

type Mat3 = [[number, number, number], [number, number, number], [number, number, number]]

function matMulVec(m: Mat3, v: [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ]
}

function transpose(m: Mat3): Mat3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ]
}

function rotZ(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1],
  ]
}

function rotY(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    [c, 0, -s],
    [0, 1, 0],
    [s, 0, c],
  ]
}

function matMul(a: Mat3, b: Mat3): Mat3 {
  const row = (i: 0 | 1 | 2): [number, number, number] => [
    a[i][0] * b[0][0] + a[i][1] * b[1][0] + a[i][2] * b[2][0],
    a[i][0] * b[0][1] + a[i][1] * b[1][1] + a[i][2] * b[2][1],
    a[i][0] * b[0][2] + a[i][1] * b[1][2] + a[i][2] * b[2][2],
  ]
  return [row(0), row(1), row(2)]
}

// Precession matrix mapping a J2000 equatorial unit vector to the mean
// equator/equinox of `jd` (Meeus eq. 21.3). Its transpose is the exact
// inverse (a pure rotation is orthogonal), used for date -> J2000.
function precessionMatrix(jd: number): Mat3 {
  const T = (jd - 2451545.0) / 36525.0
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * ARCSEC * DEG
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * ARCSEC * DEG
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * ARCSEC * DEG
  return matMul(matMul(rotZ(-z), rotY(theta)), rotZ(-zeta))
}

function raDecToVec(raDeg: number, decDeg: number): [number, number, number] {
  const ra = raDeg * DEG
  const dec = decDeg * DEG
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
}

function vecToRaDec(v: [number, number, number]): RaDec {
  return { raDeg: norm360(Math.atan2(v[1], v[0]) / DEG), decDeg: Math.asin(v[2]) / DEG }
}

// Hour angle + declination -> altitude + azimuth (measured from North,
// through East — the same convention astropy's AltAz frame uses).
function hourAngleDecToAltAz(haDeg: number, decDeg: number, latDeg: number): AltAz {
  const ha = haDeg * DEG
  const dec = decDeg * DEG
  const lat = latDeg * DEG

  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha)
  const alt = Math.asin(sinAlt)
  const cosAlt = Math.cos(alt)

  const sinAz = (-Math.sin(ha) * Math.cos(dec)) / cosAlt
  const cosAz = (Math.sin(dec) - sinAlt * Math.sin(lat)) / (cosAlt * Math.cos(lat))
  const az = norm360(Math.atan2(sinAz, cosAz) / DEG)

  return { altDeg: alt / DEG, azDeg: az }
}

// Inverse of the above — same spherical triangle, Alt/Az and HA/Dec swapped.
function altAzToHourAngleDec(altDeg: number, azDeg: number, latDeg: number): { haDeg: number; decDeg: number } {
  const alt = altDeg * DEG
  const az = azDeg * DEG
  const lat = latDeg * DEG

  const sinDec = Math.sin(alt) * Math.sin(lat) + Math.cos(alt) * Math.cos(lat) * Math.cos(az)
  const dec = Math.asin(sinDec)
  const cosDec = Math.cos(dec)

  const sinHa = (-Math.sin(az) * Math.cos(alt)) / cosDec
  const cosHa = (Math.sin(alt) - sinDec * Math.sin(lat)) / (cosDec * Math.cos(lat))
  const ha = norm360(Math.atan2(sinHa, cosHa) / DEG)

  return { haDeg: ha, decDeg: dec / DEG }
}

export function raDecToAltAz(raDec: RaDec, location: GeoLocation, date: Date): AltAz {
  const jd = julianDate(date)
  const dateVec = matMulVec(precessionMatrix(jd), raDecToVec(raDec.raDeg, raDec.decDeg))
  const { raDeg: raOfDate, decDeg: decOfDate } = vecToRaDec(dateVec)

  const lst = norm360(gmstDeg(jd) + location.longitudeDeg)
  const ha = norm360(lst - raOfDate)

  return hourAngleDecToAltAz(ha, decOfDate, location.latitudeDeg)
}

export function altAzToRaDec(altAz: AltAz, location: GeoLocation, date: Date): RaDec {
  const jd = julianDate(date)
  const { haDeg, decDeg: decOfDate } = altAzToHourAngleDec(altAz.altDeg, altAz.azDeg, location.latitudeDeg)

  const lst = norm360(gmstDeg(jd) + location.longitudeDeg)
  const raOfDate = norm360(lst - haDeg)

  const j2000Vec = matMulVec(transpose(precessionMatrix(jd)), raDecToVec(raOfDate, decOfDate))
  return vecToRaDec(j2000Vec)
}
