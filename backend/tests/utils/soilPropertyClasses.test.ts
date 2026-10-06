import { describe, it, expect } from '@jest/globals';
import { buildClassLookup, classLabel, isStorableClassValue, substituteClassLabels } from '../../src/utils/soilPropertyClasses';
import { SoilRecord } from '../../src/interfaces/Record';

const classes = { '1': { label: 'Clay' }, '12': { label: 'Sand' } };

describe('classLabel', () => {
  it.each([
    [1, 'Clay'],
    ['12', 'Sand'],
    ['1.000', 'Clay'], // numeric as it comes back from Postgres after the cleaning step's rounding
    ['1.5', null],
    [3, null],
    [null, null],
    ['', null],
  ])('labels %p as %p', (value, expected) => {
    expect(classLabel(classes, value)).toBe(expected);
  });

  it('returns null for a property without classes', () => {
    expect(classLabel(null, 1)).toBeNull();
  });
});

describe('buildClassLookup', () => {
  it('maps each code, label and alias, normalized, to its code', () => {
    expect(buildClassLookup({ '1': { label: 'Clay' }, '8': { label: 'Silty Loam', aliases: ['Silt  Loam', 'SiL'] } })).toEqual({
      '1': 1,
      clay: 1,
      '8': 8,
      'silty loam': 8,
      'silt loam': 8,
      sil: 8,
    });
  });
});

describe('isStorableClassValue', () => {
  const withZero = { '0': { label: 'Not drought vulnerable' }, '1': { label: 'Drought vulnerable' } };

  it.each([
    [1, true],
    ['12', true],
    ['1.000', true],
    [null, false],
    [undefined, false],
    ['', false],
  ])('stores %p as %p', (value, expected) => {
    expect(isStorableClassValue(classes, value, 'texture')).toBe(expected);
  });

  it.each([0, '0', '0.000'])('stores %p when 0 is a class', value => {
    expect(isStorableClassValue(withZero, value, 'drought')).toBe(true);
  });

  it.each([
    [0, '0'],
    ['0.000', '0'],
    [3, '3'],
    ['13', '13'],
    ['1.5', '1.5'],
  ])('rejects %p with a 400 when it is not a class', (value, code) => {
    expect(() => isStorableClassValue(classes, value, 'texture')).toThrow(
      expect.objectContaining({ status: 400, message: expect.stringContaining(`${code} is not one of them`) }),
    );
  });

  it.each(['Clay', '1a', 'NaN', Number.NaN, true])('rejects the non-numeric %p with a 400 naming the column', value => {
    expect(() => isStorableClassValue(classes, value, 'texture')).toThrow(
      expect.objectContaining({ status: 400, message: expect.stringContaining('"texture"') }),
    );
  });
});

describe('substituteClassLabels', () => {
  it('replaces only categorical values that are known classes', () => {
    const records = [
      { record_id: 1, texture: '12.000', ph: '7.000', geometry: null },
      { record_id: 2, texture: '5.000', ph: null, geometry: null },
      { record_id: 3, texture: null, ph: '6.000', geometry: null },
    ] as unknown as SoilRecord[];

    const result = substituteClassLabels(records, {
      texture: { property_id: 'texture', classes },
      ph: { property_id: 'ph', classes: null },
    });

    expect(result.map(r => [r['texture'], r['ph']])).toEqual([
      ['Sand', '7.000'],
      ['5.000', null],
      [null, '6.000'],
    ]);
  });
});
