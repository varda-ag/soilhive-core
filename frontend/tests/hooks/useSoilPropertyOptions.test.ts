import { renderHook } from '@testing-library/react';
import { useSoilPropertyOptions } from 'hooks/useSoilPropertyOptions';
import { useSoilProperties } from 'hooks/useSoilProperties';

jest.mock('hooks/useSoilProperties', () => ({
  useSoilProperties: jest.fn(),
}));

const mockUseSoilProperties = useSoilProperties as jest.Mock;

describe('useSoilPropertyOptions', () => {
  it('returns an empty options list and unit map when there is no data yet', () => {
    mockUseSoilProperties.mockReturnValue({ data: undefined, isLoading: true });
    const { result } = renderHook(() => useSoilPropertyOptions());
    expect(result.current.soilPropertyOptions).toEqual([]);
    expect(result.current.unitOptionsByConcept).toEqual({});
    expect(result.current.isLoadingSoilProperties).toBe(true);
  });

  it('sorts soil property options alphabetically by name', () => {
    mockUseSoilProperties.mockReturnValue({
      data: [
        { id: 'p1', property_name: 'Zinc', original_units_of_measurement: {} },
        { id: 'p2', property_name: 'Aluminium', original_units_of_measurement: {} },
      ],
      isLoading: false,
    });
    const { result } = renderHook(() => useSoilPropertyOptions());
    expect(result.current.soilPropertyOptions).toEqual([
      { code: 'p2', name: 'Aluminium' },
      { code: 'p1', name: 'Zinc' },
    ]);
  });

  it('excludes properties that are a parent of another property', () => {
    mockUseSoilProperties.mockReturnValue({
      data: [
        { id: 'parent', property_name: 'Carbon', original_units_of_measurement: {} },
        { id: 'child', property_name: 'Carbon organic', parent_property_id: 'parent', original_units_of_measurement: {} },
      ],
      isLoading: false,
    });
    const { result } = renderHook(() => useSoilPropertyOptions());
    expect(result.current.soilPropertyOptions.map(o => o.code)).toEqual(['child']);
  });

  it('builds unitOptionsByConcept from original_units_of_measurement for every property, including parents', () => {
    mockUseSoilProperties.mockReturnValue({
      data: [{ id: 'p1', property_name: 'pH', original_units_of_measurement: { 'mg/kg': 'mg/kg', 'g/kg': 'g/kg' } }],
      isLoading: false,
    });
    const { result } = renderHook(() => useSoilPropertyOptions());
    expect(result.current.unitOptionsByConcept.p1).toEqual([
      { code: 'mg/kg', name: 'mg/kg' },
      { code: 'g/kg', name: 'g/kg' },
    ]);
  });
});
