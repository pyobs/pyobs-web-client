import { describe, it, expect } from 'vitest'
import {
  localTag,
  xmlToValue,
  valueToXml,
  parseWireType,
  parseVersionedFeature,
  parseInterfaceSchema,
  parseEventSchema,
  type WireType,
} from '../pyobs-codec'

// Fixtures below are trimmed from real disco#info responses captured against a
// live pyobs-core 2.0 module (see DEVELOPMENT.md) — not hand-invented shapes.

function el(xml: string): Element {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const el = doc.documentElement
  if (el.tagName === 'parsererror' || el.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`invalid XML fixture: ${xml}`)
  }
  return el
}

describe('localTag', () => {
  it('strips namespace prefixes', () => {
    expect(localTag(el('<foo xmlns="urn:pyobs:state:ICooling:1"/>'))).toBe('foo')
    expect(localTag(el('<pfx:foo xmlns:pfx="urn:pyobs:state:ICooling:1"/>'))).toBe('foo')
  })
})

describe('xmlToValue', () => {
  it('decodes scalars', () => {
    expect(xmlToValue(el('<nil/>'))).toBeNull()
    expect(xmlToValue(el('<boolean>true</boolean>'))).toBe(true)
    expect(xmlToValue(el('<boolean>false</boolean>'))).toBe(false)
    expect(xmlToValue(el('<int>42</int>'))).toBe(42)
    expect(xmlToValue(el('<int>-3</int>'))).toBe(-3)
    expect(xmlToValue(el('<double>3.5</double>'))).toBe(3.5)
    expect(xmlToValue(el('<string>hello</string>'))).toBe('hello')
    expect(xmlToValue(el('<string></string>'))).toBe('')
  })

  it('decodes a list (items and tuple use the same shape)', () => {
    const items = el('<items><item><int>1</int></item><item><int>2</int></item></items>')
    expect(xmlToValue(items)).toEqual([1, 2])

    const tuple = el('<tuple><item><boolean>true</boolean></item><item><string>x</string></item></tuple>')
    expect(xmlToValue(tuple)).toEqual([true, 'x'])
  })

  it('decodes a dict', () => {
    const dict = el(
      '<dict><entry><key><string>a</string></key><val><int>1</int></val></entry>' +
        '<entry><key><string>b</string></key><val><boolean>false</boolean></val></entry></dict>',
    )
    expect(xmlToValue(dict)).toEqual({ a: 1, b: false })
  })

  it('decodes an unrecognized tag as a dataclass (state/capabilities shape)', () => {
    // real CoolingState payload shape
    const state = el(
      '<state xmlns="urn:pyobs:state:ICooling:1">' +
        '<setpoint><double>-10</double></setpoint>' +
        '<power><int>96</int></power>' +
        '<enabled><boolean>true</boolean></enabled>' +
        '<time><string>2026-07-02 15:53:25.446</string></time>' +
        '</state>',
    )
    expect(xmlToValue(state)).toEqual({
      setpoint: -10,
      power: 96,
      enabled: true,
      time: '2026-07-02 15:53:25.446',
    })
  })

  it('decodes an optional field that came back nil', () => {
    const state = el(
      '<state xmlns="urn:pyobs:state:ICooling:1"><setpoint><nil/></setpoint><enabled><boolean>false</boolean></enabled></state>',
    )
    expect(xmlToValue(state)).toEqual({ setpoint: null, enabled: false })
  })

  it('decodes nested dataclasses inside a list (MotionState.devices shape)', () => {
    const motion = el(
      '<state xmlns="urn:pyobs:state:IMotion:1">' +
        '<status><string>idle</string></status>' +
        '<devices><items>' +
        '<item><state xmlns="urn:pyobs:rpc:1"><name><string>az</string></name><status><string>idle</string></status></state></item>' +
        '<item><state xmlns="urn:pyobs:rpc:1"><name><string>alt</string></name><status><string>idle</string></status></state></item>' +
        '</items></devices>' +
        '</state>',
    )
    expect(xmlToValue(motion)).toEqual({
      status: 'idle',
      devices: [
        { name: 'az', status: 'idle' },
        { name: 'alt', status: 'idle' },
      ],
    })
  })

  it('handles a namespace-prefixed round-trip element the same as an unprefixed one', () => {
    const withPrefix = el('<p:int xmlns:p="urn:pyobs:rpc:1">7</p:int>')
    expect(xmlToValue(withPrefix)).toBe(7)
  })
})

describe('valueToXml + xmlToValue round trip', () => {
  const cases: Array<[unknown, WireType]> = [
    [true, 'bool'],
    [false, 'bool'],
    [42, 'int32'],
    [-3, 'int32'],
    [3.5, 'float64'],
    ['hello', 'string'],
    ['2026-07-02T00:00:00', 'datetime'],
    ['idle', { kind: 'enum', name: 'MotionStatus' }],
  ]

  it.each(cases)('round-trips %j as %j', (value, type) => {
    const encoded = valueToXml(value, type)
    expect(xmlToValue(encoded)).toBe(value)
  })

  it('round-trips null through an optional wrapper as nil', () => {
    const encoded = valueToXml(null, { kind: 'optional', inner: 'float64' })
    expect(localTag(encoded)).toBe('nil')
    expect(xmlToValue(encoded)).toBeNull()
  })

  it('round-trips a present value through an optional wrapper as the inner type', () => {
    const encoded = valueToXml(-10, { kind: 'optional', inner: 'float64' })
    expect(localTag(encoded)).toBe('double')
    expect(xmlToValue(encoded)).toBe(-10)
  })

  it('round-trips an array of scalars', () => {
    const encoded = valueToXml([1, 2, 3], { kind: 'array', item: 'int32' })
    expect(xmlToValue(encoded)).toEqual([1, 2, 3])
  })

  it('encodes int32 vs float64 by declared type, not runtime shape', () => {
    // 5 typed as float64 must produce <double>, not <int> — the wire
    // distinguishes int/float by tag, and JS has no separate int type to infer from.
    const encoded = valueToXml(5, 'float64')
    expect(localTag(encoded)).toBe('double')
  })

  it('throws for wire types it cannot build a value for (no schema for their fields)', () => {
    expect(() => valueToXml({}, { kind: 'struct', name: 'SensorReading' })).toThrow()
    expect(() => valueToXml({}, 'any')).toThrow()
  })
})

describe('parseWireType', () => {
  it('parses primitives', () => {
    expect(parseWireType('bool')).toBe('bool')
    expect(parseWireType('int32')).toBe('int32')
    expect(parseWireType('float64')).toBe('float64')
    expect(parseWireType('string')).toBe('string')
    expect(parseWireType('void')).toBe('void')
    expect(parseWireType('datetime')).toBe('datetime')
  })

  it('parses enum(Name) and struct<Name>', () => {
    expect(parseWireType('enum(ImageFormat)')).toEqual({ kind: 'enum', name: 'ImageFormat' })
    expect(parseWireType('struct<SensorReading>')).toEqual({ kind: 'struct', name: 'SensorReading' })
  })

  it('parses array<T> and optional<T>', () => {
    expect(parseWireType('array<int32>')).toEqual({ kind: 'array', item: 'int32' })
    expect(parseWireType('optional<float64>')).toEqual({ kind: 'optional', inner: 'float64' })
  })

  it('parses nested generic types (real ITemperatures/ICooling shapes)', () => {
    expect(parseWireType('array<struct<SensorReading>>')).toEqual({
      kind: 'array',
      item: { kind: 'struct', name: 'SensorReading' },
    })
    expect(parseWireType('optional<enum(ExposureStatus)>')).toEqual({
      kind: 'optional',
      inner: { kind: 'enum', name: 'ExposureStatus' },
    })
  })

  it('falls back to any for unrecognized syntax', () => {
    expect(parseWireType('')).toBe('any')
    expect(parseWireType('dict<string,int32>')).toBe('any')
  })
})

describe('parseVersionedFeature', () => {
  it('parses a well-formed feature string', () => {
    expect(parseVersionedFeature('interface', 'urn:pyobs:interface:ICooling:1')).toEqual({
      name: 'ICooling',
      version: 1,
    })
    expect(parseVersionedFeature('event', 'urn:pyobs:event:LogEvent:1')).toEqual({ name: 'LogEvent', version: 1 })
    expect(parseVersionedFeature('capabilities', 'urn:pyobs:capabilities:IWindow:1')).toEqual({
      name: 'IWindow',
      version: 1,
    })
  })

  it('rejects the wrong kind, the old unversioned format, and garbage', () => {
    expect(parseVersionedFeature('interface', 'urn:pyobs:event:LogEvent:1')).toBeNull()
    expect(parseVersionedFeature('interface', 'pyobs:interface:ICooling')).toBeNull()
    expect(parseVersionedFeature('interface', 'urn:pyobs:interface:ICooling:notanumber')).toBeNull()
    expect(parseVersionedFeature('interface', '')).toBeNull()
  })
})

describe('parseInterfaceSchema', () => {
  // trimmed from a live ICooling disco#info schema block
  const cooling = el(
    "<interface xmlns='urn:pyobs:interface:ICooling:1' name='ICooling'>" +
      "<command name='set_cooling'><parameter name='enabled' type='bool'/>" +
      "<parameter name='setpoint' type='float64' unit='celsius'/></command>" +
      "<state node='state/ICooling/1'><field name='setpoint' type='optional&lt;float64&gt;'/>" +
      "<field name='power' type='optional&lt;int32&gt;'/><field name='enabled' type='bool'/>" +
      "<field name='time' type='datetime'/></state></interface>",
  )

  it('parses name and version from the namespace', () => {
    const schema = parseInterfaceSchema(cooling)
    expect(schema.name).toBe('ICooling')
    expect(schema.version).toBe(1)
  })

  it('parses commands with typed, unit-annotated parameters', () => {
    const schema = parseInterfaceSchema(cooling)
    expect(Object.keys(schema.commands)).toEqual(['set_cooling'])
    expect(schema.commands.set_cooling!.params).toEqual([
      { name: 'enabled', type: 'bool', unit: undefined },
      { name: 'setpoint', type: 'float64', unit: 'celsius' },
    ])
  })

  it('parses the state block, including optional-wrapped fields', () => {
    const schema = parseInterfaceSchema(cooling)
    expect(schema.state).not.toBeNull()
    expect(schema.state?.node).toBe('state/ICooling/1')
    expect(schema.state?.fields).toEqual([
      { name: 'setpoint', type: { kind: 'optional', inner: 'float64' }, unit: undefined },
      { name: 'power', type: { kind: 'optional', inner: 'int32' }, unit: undefined },
      { name: 'enabled', type: 'bool', unit: undefined },
      { name: 'time', type: 'datetime', unit: undefined },
    ])
  })

  it('parses enum types and enum-typed command parameters (IImageFormat shape)', () => {
    const imageFormat = el(
      "<interface xmlns='urn:pyobs:interface:IImageFormat:1' name='IImageFormat'>" +
        "<types><enum name='ImageFormat'><value>int8</value><value>int16</value>" +
        "<value>float32</value><value>float64</value><value>rgb24</value></enum></types>" +
        "<command name='set_image_format'><parameter name='fmt' type='enum(ImageFormat)'/></command>" +
        "<state node='state/IImageFormat/1'><field name='image_format' type='enum(ImageFormat)'/>" +
        "<field name='time' type='datetime'/></state></interface>",
    )
    const schema = parseInterfaceSchema(imageFormat)
    expect(schema.enums).toEqual({ ImageFormat: ['int8', 'int16', 'float32', 'float64', 'rgb24'] })
    expect(schema.commands.set_image_format!.params).toEqual([
      { name: 'fmt', type: { kind: 'enum', name: 'ImageFormat' }, unit: undefined },
    ])
  })

  it('parses a nested array<struct<Name>> state field (ITemperatures shape)', () => {
    const temperatures = el(
      "<interface xmlns='urn:pyobs:interface:ITemperatures:1' name='ITemperatures'>" +
        "<state node='state/ITemperatures/1'><field name='readings' type='array&lt;struct&lt;SensorReading&gt;&gt;'/>" +
        "<field name='time' type='datetime'/></state></interface>",
    )
    const schema = parseInterfaceSchema(temperatures)
    expect(schema.state?.fields[0]).toEqual({
      name: 'readings',
      type: { kind: 'array', item: { kind: 'struct', name: 'SensorReading' } },
      unit: undefined,
    })
  })

  it('has no commands and no state for an interface that only declares capabilities (IModule shape)', () => {
    const module = el("<interface xmlns='urn:pyobs:interface:IModule:1' name='IModule'><command name='reset_error'/></interface>")
    const schema = parseInterfaceSchema(module)
    expect(schema.commands.reset_error!.params).toEqual([])
    expect(schema.state).toBeNull()
  })
})

describe('parseEventSchema', () => {
  it('parses fields and enum types (ExposureStatusChangedEvent shape)', () => {
    const event = el(
      "<event xmlns='urn:pyobs:event:ExposureStatusChangedEvent:1' name='ExposureStatusChangedEvent'>" +
        "<types><enum name='ExposureStatus'><value>idle</value><value>exposing</value>" +
        "<value>readout</value><value>error</value></enum></types>" +
        "<field name='current' type='enum(ExposureStatus)'/>" +
        "<field name='last' type='optional&lt;enum(ExposureStatus)&gt;'/></event>",
    )
    const schema = parseEventSchema(event)
    expect(schema.name).toBe('ExposureStatusChangedEvent')
    expect(schema.version).toBe(1)
    expect(schema.enums).toEqual({ ExposureStatus: ['idle', 'exposing', 'readout', 'error'] })
    expect(schema.fields).toEqual([
      { name: 'current', type: { kind: 'enum', name: 'ExposureStatus' }, unit: undefined },
      { name: 'last', type: { kind: 'optional', inner: { kind: 'enum', name: 'ExposureStatus' } }, unit: undefined },
    ])
  })

  it('parses a plain event with no enum types (LogEvent shape)', () => {
    const event = el(
      "<event xmlns='urn:pyobs:event:LogEvent:1' name='LogEvent'>" +
        "<field name='time' type='string'/><field name='level' type='string'/>" +
        "<field name='line' type='int32'/></event>",
    )
    const schema = parseEventSchema(event)
    expect(schema.enums).toEqual({})
    expect(schema.fields.map((f) => f.name)).toEqual(['time', 'level', 'line'])
  })
})
