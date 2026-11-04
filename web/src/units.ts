// Display units for a path. The server resolves the user's unit preference
// into the path's metadata (`meta.displayUnits.targetUnit`, named as in its
// unit definitions); a widget may override it. Only linear conversions are
// offered, which covers every unit a strip chart is useful for.

export interface Conversion {
  /** The server's unit id, e.g. `kn` or `degree`. */
  id: string
  symbol: string
  /** display = (si + offset) * factor + add */
  factor: number
  offset?: number
  add?: number
}

const c = (id: string, symbol: string, factor: number, offset = 0, add = 0): Conversion => ({
  id,
  symbol,
  factor,
  offset,
  add
})

/** Conversions by Signal K base unit, the first one the default. */
export const CONVERSIONS: Record<string, Conversion[]> = {
  rad: [c('degree', '°', 180 / Math.PI), c('radian', 'rad', 1)],
  'm/s': [
    c('kn', 'kn', 1.94384),
    c('m/s', 'm/s', 1),
    c('km/h', 'km/h', 3.6),
    c('mph', 'mph', 2.2369362920544025)
  ],
  K: [c('C', '°C', 1, -273.15), c('F', '°F', 9 / 5, -273.15, 32), c('K', 'K', 1)],
  Pa: [
    c('hPa', 'hPa', 0.01),
    c('mbar', 'mbar', 0.01),
    c('bar', 'bar', 0.00001),
    c('psi', 'psi', 0.0001450376807894691),
    c('inHg', 'inHg', 0.00029529987601298443),
    c('mmHg', 'mmHg', 0.0075006168507298),
    c('Pa', 'Pa', 1)
  ],
  m: [
    c('m', 'm', 1),
    c('meter', 'm', 1),
    c('foot', 'ft', 3.280839895013124),
    c('fathom', 'fathom', 0.5467468562055768),
    c('naut-mile', 'nmi', 0.0005399568034557236),
    c('kilometer', 'km', 0.001),
    c('mile', 'mi', 0.000621371192237334)
  ],
  'rad/s': [
    c('deg/s', '°/s', 57.29577951308232),
    c('rpm', 'rpm', 9.549296585513723),
    c('rad/s', 'rad/s', 1)
  ],
  ratio: [c('percent', '%', 100), c('ratio', '', 1)],
  Hz: [c('rpm', 'rpm', 60), c('hertz', 'Hz', 1)],
  V: [c('V', 'V', 1)],
  A: [c('A', 'A', 1)],
  W: [c('watt', 'W', 1), c('kW', 'kW', 0.001)],
  m3: [c('liter', 'l', 1000), c('gallon', 'gal', 264.1720512415585), c('m3', 'm³', 1)],
  'm3/s': [c('L/h', 'l/h', 3600000), c('L/min', 'l/min', 60000), c('gal/h', 'gal/h', 264.17205236)]
}

export interface DisplayUnits {
  targetUnit?: string
  displayFormat?: string
}

export interface PathMeta {
  units?: string
  displayUnits?: DisplayUnits
}

export interface Display {
  conversion: Conversion | undefined
  symbol: string
  decimals: number
  angular: boolean
}

export function convert(si: number, conversion: Conversion | undefined): number {
  if (!conversion) return si
  return (si + (conversion.offset ?? 0)) * conversion.factor + (conversion.add ?? 0)
}

/** Decimal places a format such as `0.0` asks for. */
export function decimalsOf(format: string | undefined): number | undefined {
  if (!format) return undefined
  const match = /\.(0+)/.exec(format)
  return match?.[1]?.length ?? 0
}

/**
 * How to show a path: the widget's own unit if it set one the path's base
 * unit allows, else the server's preference, else the base unit's default.
 * `decimals` < 0 means automatic.
 */
export function resolveDisplay(
  meta: PathMeta | undefined,
  override: string | undefined,
  decimals: number
): Display {
  const units = meta?.units
  const options = units ? (CONVERSIONS[units] ?? []) : []
  const byId = (id: string | undefined) => options.find((o) => o.id === id)
  const conversion = byId(override) ?? byId(meta?.displayUnits?.targetUnit) ?? options[0]
  const angular = units === 'rad'
  const fromServer =
    conversion && conversion.id === meta?.displayUnits?.targetUnit
      ? decimalsOf(meta.displayUnits.displayFormat)
      : undefined
  const auto = conversion?.id === 'degree' ? 0 : (fromServer ?? 1)
  return {
    conversion,
    symbol: conversion?.symbol ?? units ?? '',
    decimals: decimals >= 0 ? decimals : auto,
    angular
  }
}
