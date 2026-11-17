import { describe, it, expect } from '@jest/globals';
import { isLongMapping, longFormatProblem, matchColumns, matchKey, metadataEntries } from '../../src/utils/longFormat';
import { DataMappingObject, LongFormatMapping, MAX_MEASUREMENT_TYPES } from '../../src/types/DataMapping';

const long = (overrides: Partial<LongFormatMapping> = {}): LongFormatMapping => ({
  property_col: 'det',
  value_col: 'conc',
  measurement_types: [
    { col: 's1', match: { property: 'P_OLSEN_2' }, property_id: 'phosphorus' },
    { col: 's2', match: { property: 'pH_H2O' }, property_id: 'ph' },
  ],
  ...overrides,
});

const mapping = (long_format: unknown, columns: Record<string, unknown> = {}): DataMappingObject =>
  ({ top: 'min_depth', bottom: 'max_depth', ...columns, long_format }) as DataMappingObject;

describe('longFormat', () => {
  describe('isLongMapping', () => {
    it('is true for a mapping with a long_format object', () => {
      expect(isLongMapping(mapping(long()))).toBe(true);
    });

    it('is false for a wide mapping, and for a source column named long_format', () => {
      expect(isLongMapping({ ph: { property_id: 'ph' } })).toBe(false);
      expect(isLongMapping({ long_format: 'horizon' } as unknown as DataMappingObject)).toBe(false);
    });
  });

  describe('matchColumns and matchKey', () => {
    it('lists the role columns in a fixed order, whatever the order they were given in', () => {
      const columns = matchColumns(
        long({ procedure_cols: { laboratory_method: 'lab_method', technique: 'how' }, method_code_col: 'method', unit_col: 'um' }),
      );
      expect(columns).toEqual([
        ['property', 'det'],
        ['unit', 'um'],
        ['method_code', 'method'],
        ['technique', 'how'],
        ['laboratory_method', 'lab_method'],
      ]);
    });

    it('builds the key from trimmed values, with null for an empty or absent one', () => {
      const config = long({ unit_col: 'um', method_code_col: 'method' });
      expect(matchKey(config, { col: 's1', match: { property: ' P_OLSEN_2 ', unit: '' } })).toEqual(['P_OLSEN_2', null, null]);
    });

    it('has no role column for a file with one fixed property and nothing else', () => {
      expect(matchColumns({ fixed_property_id: 'ph', value_col: 'value', measurement_types: [] })).toEqual([]);
    });
  });

  describe('metadataEntries', () => {
    it('leaves out the geometry columns and the reserved keys', () => {
      const entries = metadataEntries(
        mapping(long(), { wkt: 'geometry', lat: 'latitude', lon: 'longitude', date: 'sampling_date', drop_records: [3] }),
      );
      expect(entries).toEqual([
        ['top', 'min_depth'],
        ['bottom', 'max_depth'],
        ['date', 'sampling_date'],
      ]);
    });
  });

  describe('longFormatProblem', () => {
    it('accepts a mapping with a property column', () => {
      expect(longFormatProblem(mapping(long()))).toBeNull();
    });

    it('accepts a mapping with a fixed property and no property column', () => {
      const config = long({ property_col: undefined, fixed_property_id: 'phosphorus', unit_col: 'unit' });
      config.measurement_types = [{ col: 's1', match: { unit: 'mg/kg' } }];
      expect(longFormatProblem(mapping(config))).toBeNull();
    });

    it.each([
      ['a long_format that is no object', mapping([]), 'must be an object'],
      ['no value column', mapping(long({ value_col: '' })), 'value_col is required'],
      [
        'neither a property column nor a fixed property',
        mapping(long({ property_col: undefined })),
        'either property_col or fixed_property_id',
      ],
      [
        'both a property column and a fixed property',
        mapping(long({ fixed_property_id: 'ph' })),
        'either property_col or fixed_property_id',
      ],
      ['no measurement type', mapping(long({ measurement_types: [] })), 'at least one measurement type'],
      [
        'too many measurement types',
        mapping(
          long({
            measurement_types: Array.from({ length: MAX_MEASUREMENT_TYPES + 1 }, (_, i) => ({
              col: `s${i + 1}`,
              match: { property: `p${i}` },
              property_id: 'ph',
            })),
          }),
        ),
        `more than ${MAX_MEASUREMENT_TYPES}`,
      ],
      ['a column mapped to a property', mapping(long(), { ph: { property_id: 'ph' } }), "Column 'ph' is mapped to a soil property"],
      [
        'a column name that is not s and a number',
        mapping(long({ measurement_types: [{ col: 'ph; DROP TABLE x', match: { property: 'pH' }, property_id: 'ph' }] })),
        "must be 's' followed by a number",
      ],
      [
        'a column name used twice',
        mapping(
          long({
            measurement_types: [
              { col: 's1', match: { property: 'a' }, property_id: 'ph' },
              { col: 's1', match: { property: 'b' }, property_id: 'ph' },
            ],
          }),
        ),
        'used more than once',
      ],
      [
        'a column name taken by a mapped column of the file',
        mapping(long(), { s1: 'horizon' }),
        'has the name of a mapped column of the file',
      ],
      [
        'a measurement type with no property',
        mapping(long({ measurement_types: [{ col: 's1', match: { property: 'a' } }] })),
        'has no property_id',
      ],
      [
        'a measurement type naming another property than the fixed one',
        mapping(
          long({
            property_col: undefined,
            fixed_property_id: 'ph',
            measurement_types: [{ col: 's1', match: {}, property_id: 'clay' }],
          }),
        ),
        'another property than fixed_property_id',
      ],
      [
        'a measurement type with no property code to match',
        mapping(long({ measurement_types: [{ col: 's1', match: { unit: '%' }, property_id: 'ph' }] })),
        'has no match.property',
      ],
      [
        'two measurement types with the same match',
        mapping(
          long({
            measurement_types: [
              { col: 's1', match: { property: 'a' }, property_id: 'ph' },
              { col: 's2', match: { property: ' a ' }, property_id: 'clay' },
            ],
          }),
        ),
        'same match as another one',
      ],
    ])('refuses %s', (_case, dataMapping, problem) => {
      expect(longFormatProblem(dataMapping)).toContain(problem);
    });
  });
});
