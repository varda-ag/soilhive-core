import { formatNoData, formatRasterNoData } from 'utilities/noData';

const label = (limit: 'min' | 'max', dataType: string) => `${dataType} ${limit}`;
const band = (data_type: string, no_data_value?: number | 'NaN' | 'Infinity' | '-Infinity') => ({
  band_number: 1,
  data_type,
  ...(no_data_value !== undefined && { no_data_value }),
});

describe('formatNoData', () => {
  it('shows "-" for a band that declares no NODATA', () => {
    expect(formatNoData(band('Byte'), label)).toBe('-');
  });

  it.each([
    [band('Byte', 0), '0'],
    [band('Byte', 255), '255'],
    [band('Int16', -32768), '-32768'],
    [band('Float32', -9999), '-9999'],
    [band('Float32', 0.1), '0.1'],
  ])('shows a value that reads fine as a number as one', (b, expected) => {
    expect(formatNoData(b, label)).toBe(expected);
  });

  it.each([
    // As gdalinfo prints it: rounded, so only equal as a Float32
    [band('Float32', -3.4028235e38), 'Float32 min'],
    [band('Float32', 3.4028235e38), 'Float32 max'],
    [band('Float64', -Number.MAX_VALUE), 'Float64 min'],
    [band('UInt32', 4294967295), 'UInt32 max'],
    [band('Int32', -2147483648), 'Int32 min'],
  ])('names the limit of the band data type', (b, expected) => {
    expect(formatNoData(b, label)).toBe(expected);
  });

  it('shows a value near but not at the limit as a number', () => {
    expect(formatNoData(band('Float32', -3.4e38), label)).toBe('-3.4e+38');
  });

  it('names a limit only for the band data type', () => {
    expect(formatNoData(band('Float64', 4294967295), label)).toBe('4294967295');
  });

  it.each([
    ['NaN', 'NaN'],
    ['Infinity', '+∞'],
    ['-Infinity', '−∞'],
  ] as const)('shows %s, which gdalinfo writes as a string, as %s', (value, expected) => {
    expect(formatNoData(band('Float32', value), label)).toBe(expected);
  });
});

describe('formatRasterNoData', () => {
  it('shows one value when every band agrees', () => {
    expect(formatRasterNoData([band('Byte', 0), band('Byte', 0)], label)).toBe('0');
  });

  it('lists the distinct values in band order, with "-" for a band that declares none', () => {
    expect(formatRasterNoData([band('Byte', 255), band('Byte', 0), band('Byte'), band('Byte', 0)], label)).toBe('255, 0, -');
  });

  it('shows "-" when no band is known', () => {
    expect(formatRasterNoData(undefined, label)).toBe('-');
    expect(formatRasterNoData([], label)).toBe('-');
  });
});
