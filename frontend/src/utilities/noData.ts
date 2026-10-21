import type { FileRasterBandDescriptor } from 'types/backend';

const FLOAT32_MAX = 3.4028234663852886e38;

// Only types whose limits are too long to read: 0, 255 or -32768 read fine as numbers
const TYPE_LIMITS: Record<string, [min: number, max: number]> = {
  UInt32: [0, 4294967295],
  Int32: [-2147483648, 2147483647],
  UInt64: [0, 2 ** 64 - 1],
  Int64: [-(2 ** 63), 2 ** 63 - 1],
  Float32: [-FLOAT32_MAX, FLOAT32_MAX],
  Float64: [-Number.MAX_VALUE, Number.MAX_VALUE],
};

// gdalinfo writes these as strings, JSON having no number for them
const NON_FINITE: Record<string, string> = { NaN: 'NaN', Infinity: '+∞', '-Infinity': '−∞' };

export type TypeLimitLabel = (limit: 'min' | 'max', dataType: string) => string;

/** One band's NODATA as shown to the user, or "-" when it declares none. */
export function formatNoData(band: FileRasterBandDescriptor, typeLimitLabel: TypeLimitLabel): string {
  const value = band.no_data_value;
  if (value === undefined || value === null) return '-';
  if (typeof value === 'string') return NON_FINITE[value] ?? value;

  const limits = TYPE_LIMITS[band.data_type];
  // gdalinfo prints a Float32 limit rounded (-3.4028235e+38): compare it as a Float32
  const comparable = band.data_type === 'Float32' ? Math.fround(value) : value;
  if (limits && comparable === limits[0]) return typeLimitLabel('min', band.data_type);
  if (limits && comparable === limits[1]) return typeLimitLabel('max', band.data_type);
  return String(value);
}

/** A raster's NODATA across its bands: each distinct value once, in band order. */
export function formatRasterNoData(bands: FileRasterBandDescriptor[] | undefined, typeLimitLabel: TypeLimitLabel): string {
  const values = [...new Set((bands ?? []).map(band => formatNoData(band, typeLimitLabel)))];
  return values.length > 0 ? values.join(', ') : '-';
}
