import { describe, it, expect } from '@jest/globals';
import { SuggestionSources, suggestMeasurementType } from '../../src/utils/measurementTypes';
import { buildMeasurementTypesQuery } from '../../src/data-layer/LongMeasurementTypes';
import { DataMappingObject, LongRoleColumns } from '../../src/types/DataMapping';

const ROLES: LongRoleColumns = { property_col: 'det', value_col: 'conc', unit_col: 'um' };

const sources = (overrides: Partial<SuggestionSources> = {}): SuggestionSources => ({
  mappings: [],
  properties: [
    { id: 'id-p', slug: 'phosphorus', property_name: 'Phosphorus', property_acronym: 'P' },
    { id: 'id-ph', slug: 'ph', property_name: 'pH in water', property_acronym: 'pH' },
    { id: 'id-oc', slug: 'organic-carbon', property_name: 'Organic carbon', property_acronym: 'OC' },
  ],
  conversions: [
    { slug: 'p-mg-kg', property_id: 'id-p', original_unit_of_measurement: 'mg/kg' },
    { slug: 'oc-pct', property_id: 'id-oc', original_unit_of_measurement: '%' },
    { slug: 'oc-mg-kg', property_id: 'id-oc', original_unit_of_measurement: 'mg/kg' },
  ],
  procedures: ['olsen-procedure'],
  vocabulary: { technique: ['calculated', 'lab procedure', 'spectral'], laboratory_method: ['Olsen', 'Bray 1'] },
  ...overrides,
});

const earlier = (measurement_types: unknown[], roles: object = { property_col: 'code', value_col: 'v', unit_col: 'u' }) =>
  ({ long_format: { ...roles, measurement_types } }) as unknown as DataMappingObject;

describe('suggestMeasurementType', () => {
  describe('from the vocabularies', () => {
    it('suggests the property whose slug, name or acronym the code is equal to, with case and spaces ignored', () => {
      expect(suggestMeasurementType({ property: 'PHOSPHORUS', unit: null }, ROLES, sources())).toEqual({ property_id: 'phosphorus' });
      expect(suggestMeasurementType({ property: 'ph  in water', unit: null }, ROLES, sources())).toEqual({ property_id: 'ph' });
      expect(suggestMeasurementType({ property: 'oc', unit: null }, ROLES, sources())).toEqual({ property_id: 'organic-carbon' });
    });

    it('suggests nothing for a code no property is named by', () => {
      expect(suggestMeasurementType({ property: 'XK_17', unit: 'cmol kg-1' }, ROLES, sources())).toBeUndefined();
    });

    it('suggests no property when two share the acronym', () => {
      const twice = sources();
      twice.properties.push({ id: 'id-p2', slug: 'potassium', property_name: 'Potassium', property_acronym: 'p' });

      expect(suggestMeasurementType({ property: 'P', unit: null }, ROLES, twice)).toBeUndefined();
    });

    it('suggests the conversion of that property with the same unit', () => {
      expect(suggestMeasurementType({ property: 'OC', unit: 'MG / KG' }, ROLES, sources())).toEqual({
        property_id: 'organic-carbon',
        conversion_id: 'oc-mg-kg',
      });
    });

    it('matches the unit against the property of the whole file, and does not suggest that property back', () => {
      const roles: LongRoleColumns = { value_col: 'value', unit_col: 'unit' };

      expect(suggestMeasurementType({ unit: '%' }, roles, sources({ fixedProperty: 'organic-carbon' }))).toEqual({
        conversion_id: 'oc-pct',
      });
    });

    it('suggests the list entries the procedure values are equal to, as the lists spell them', () => {
      const roles: LongRoleColumns = { ...ROLES, procedure_cols: { technique: 'how', laboratory_method: 'lab' } };
      const match = { property: 'XK_17', unit: null, technique: 'Lab Procedure', laboratory_method: 'bray1' };

      expect(suggestMeasurementType(match, roles, sources())).toEqual({
        procedure: { technique: 'lab procedure', laboratory_method: 'Bray 1' },
      });
    });
  });

  describe('from an earlier mapping', () => {
    const answered = {
      col: 's1',
      match: { property: 'P_OLSEN_2', unit: 'mg kg-1' },
      property_id: 'phosphorus',
      conversion_id: 'p-mg-kg',
      procedure_id: 'olsen-procedure',
      min_val: 0,
      max_val: 500,
    };

    it('repeats the answers given to the same property code and unit', () => {
      const from = sources({ mappings: [earlier([answered])] });

      expect(suggestMeasurementType({ property: 'p_olsen_2', unit: 'mg kg-1' }, ROLES, from)).toEqual({
        property_id: 'phosphorus',
        conversion_id: 'p-mg-kg',
        procedure_id: 'olsen-procedure',
        min_val: 0,
        max_val: 500,
      });
    });

    it('passes over an answer given to another unit', () => {
      const from = sources({ mappings: [earlier([answered])] });

      expect(suggestMeasurementType({ property: 'P_OLSEN_2', unit: 'g/kg' }, ROLES, from)).toBeUndefined();
    });

    it('does not compare units for a file with no unit column', () => {
      const from = sources({ mappings: [earlier([answered])] });
      const roles: LongRoleColumns = { property_col: 'det', value_col: 'conc' };

      expect(suggestMeasurementType({ property: 'P_OLSEN_2' }, roles, from)?.property_id).toBe('phosphorus');
    });

    it('takes the newest of two answers, unless an older one agrees on the method code too', () => {
      const newest = { ...answered, match: { property: 'P_OLSEN_2', unit: 'mg kg-1' }, property_id: 'ph' };
      const withMethod = { ...answered, match: { ...answered.match, method_code: 'M7' } };
      const otherMethod = { ...answered, match: { ...answered.match, method_code: 'M9' }, property_id: 'organic-carbon' };
      const from = sources({ mappings: [earlier([newest]), earlier([otherMethod, withMethod])] });
      const roles: LongRoleColumns = { ...ROLES, method_code_col: 'method' };

      expect(suggestMeasurementType({ property: 'P_OLSEN_2', unit: 'mg kg-1' }, ROLES, from)?.property_id).toBe('ph');
      expect(suggestMeasurementType({ property: 'P_OLSEN_2', unit: 'mg kg-1', method_code: 'M7' }, roles, from)?.property_id).toBe(
        'phosphorus',
      );
    });

    it('leaves out slugs that no longer exist', () => {
      const from = sources({ mappings: [earlier([answered])], conversions: [], procedures: [] });

      expect(suggestMeasurementType({ property: 'P_OLSEN_2', unit: 'mg kg-1' }, ROLES, from)).toEqual({
        property_id: 'phosphorus',
        min_val: 0,
        max_val: 500,
      });
      expect(suggestMeasurementType({ property: 'P_OLSEN_2', unit: 'mg kg-1' }, ROLES, { ...from, properties: [] })).toBeUndefined();
    });

    it('reads nothing from a wide mapping', () => {
      const wide = { P_OLSEN_2: { property_id: 'phosphorus' } } as DataMappingObject;

      expect(suggestMeasurementType({ property: 'P_OLSEN_2', unit: null }, ROLES, sources({ mappings: [wide] }))).toBeUndefined();
    });
  });
});

describe('buildMeasurementTypesQuery', () => {
  it('groups by the role columns in their fixed order and reads each column once', () => {
    const query = buildMeasurementTypesQuery(
      { property_col: 'det', value_col: 'conc', unit_col: 'um', procedure_cols: { laboratory_method: 'um' } },
      'abc',
      101,
    );

    expect(query.keys).toEqual(['property', 'unit', 'laboratory_method']);
    expect(query.sourceColumns).toEqual(['det', 'um', 'conc']);
    expect(query.values).toEqual([101]);
    expect(query.sql).toContain('GROUP BY s.k0, s.k1, s.k2');
    expect(query.sql).toContain('s.k0 IS NOT NULL');
  });

  it('gives one measurement type for a file with a value column only', () => {
    const query = buildMeasurementTypesQuery({ value_col: 'value' }, 'abc', 101);

    expect(query.keys).toEqual([]);
    expect(query.sql).not.toContain('GROUP BY');
    expect(query.sql).not.toContain('s.k0');
  });

  it('quotes column names', () => {
    const query = buildMeasurementTypesQuery({ value_col: 'my "value"' }, 'abc', 101);

    expect(query.sql).toContain('l."my ""value"""');
  });
});
