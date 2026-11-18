import { describe, it, expect } from '@jest/globals';
import { MappingSlugs, withCurrentSlugs } from '../../src/data-layer/MappingSlugs';

const slugs: MappingSlugs = {
  property: new Map([
    ['ph', 'ph-in-water'],
    ['ph-in-water', 'ph-in-water'],
    ['phosphorus', 'phosphorus'],
  ]),
  conversion: new Map([
    ['ph-unitless', { slug: 'ph-in-water-unitless', property: 'ph-in-water' }],
    ['p-mg-kg', { slug: 'p-mg-kg', property: 'phosphorus' }],
  ]),
  procedure: new Map([['olsen-old', 'olsen']]),
};

describe('withCurrentSlugs', () => {
  it('replaces each old slug with the current one, and keeps the other keys', () => {
    expect(
      withCurrentSlugs({ property_id: 'ph', conversion_id: 'ph-unitless', procedure_id: 'olsen-old', min_val: 0, max_val: 14 }, slugs),
    ).toEqual({ property_id: 'ph-in-water', conversion_id: 'ph-in-water-unitless', procedure_id: 'olsen', min_val: 0, max_val: 14 });
  });

  it('answers null when the property is gone', () => {
    expect(withCurrentSlugs({ property_id: 'deleted-property', conversion_id: 'p-mg-kg' }, slugs)).toBeNull();
  });

  it('leaves out a conversion or procedure that is gone', () => {
    expect(withCurrentSlugs({ property_id: 'phosphorus', conversion_id: 'gone', procedure_id: 'gone' }, slugs)).toEqual({
      property_id: 'phosphorus',
    });
  });

  it('leaves out a conversion that now belongs to another property', () => {
    expect(withCurrentSlugs({ property_id: 'phosphorus', conversion_id: 'ph-unitless' }, slugs)).toEqual({ property_id: 'phosphorus' });
  });

  it('keeps an entry that names no property, as a long answer under a file-wide property does', () => {
    expect(withCurrentSlugs({ conversion_id: 'p-mg-kg', procedure_id: 'olsen-old' }, slugs)).toEqual({
      conversion_id: 'p-mg-kg',
      procedure_id: 'olsen',
    });
  });
});
