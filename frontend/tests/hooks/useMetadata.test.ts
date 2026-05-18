import { renderHook } from '@testing-library/react';
import { useMetadata } from 'hooks/useMetadata';
import { useDataset } from 'hooks/useDatasets';
import { useApiQuery } from 'hooks/useApiQuery';
import { useSoilProperties } from 'hooks/useSoilProperties';
import type { Dataset, License, SoilProperty } from 'types/backend';
import { GISDataType, IngestionStatus } from 'types/backend';

jest.mock('hooks/useDatasets', () => ({ useDataset: jest.fn() }));
jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('hooks/useSoilProperties', () => ({ useSoilProperties: jest.fn() }));

const mockUseDataset = useDataset as jest.Mock;
const mockUseApiQuery = useApiQuery as jest.Mock;
const mockUseSoilProperties = useSoilProperties as jest.Mock;

const baseDataset: Dataset = {
  id: 'abc',
  slug: 'ds-1',
  name: 'DS1',
  spatial_extent: null,
  status: IngestionStatus.PUBLISHED,
  created_at: new Date(0),
  updated_at: null,
  created_by: 'tester',
  gis_datatype: GISDataType.POINT,
  visibility: 'public',
};

const licenseA: License = {
  id: 'lic-1',
  name: 'CC-BY',
  created_at: new Date(0),
  updated_at: null,
};

const soilPropPh: SoilProperty = {
  id: 'sp-1',
  property_name: 'pH',
  property_acronym: 'PH',
  category_id: 'cat-1',
  original_units_of_measurement: {},
};

const soilPropOc: SoilProperty = {
  id: 'sp-3',
  property_name: 'Organic Carbon',
  property_acronym: 'OC',
  category_id: 'cat-1',
  original_units_of_measurement: {},
};

describe('useMetadata', () => {
  beforeEach(() => {
    mockUseDataset.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mockUseApiQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
    mockUseSoilProperties.mockReturnValue({ data: [], isLoading: false, isError: false });
  });

  afterEach(() => jest.clearAllMocks());

  it('forwards the id to useDataset', () => {
    renderHook(() => useMetadata('abc'));
    expect(mockUseDataset).toHaveBeenCalledWith('abc');
  });

  it('forwards undefined id to useDataset', () => {
    renderHook(() => useMetadata(undefined));
    expect(mockUseDataset).toHaveBeenCalledWith(undefined);
  });

  it('returns undefined dataset when rawDataset is undefined', () => {
    const { result } = renderHook(() => useMetadata('abc'));
    expect(result.current.dataset).toBeUndefined();
  });

  it.each([
    ['useDataset', () => mockUseDataset.mockReturnValue({ data: undefined, isLoading: true, isError: false })],
    ['useApiQuery', () => mockUseApiQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false })],
    ['useSoilProperties', () => mockUseSoilProperties.mockReturnValue({ data: undefined, isLoading: true, isError: false })],
  ])('aggregates loading from %s', (_name, setup) => {
    setup();
    const { result } = renderHook(() => useMetadata('abc'));
    expect(result.current.isLoading).toBe(true);
  });

  it.each([
    ['useDataset', () => mockUseDataset.mockReturnValue({ data: undefined, isLoading: false, isError: true })],
    ['useApiQuery', () => mockUseApiQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })],
    ['useSoilProperties', () => mockUseSoilProperties.mockReturnValue({ data: undefined, isLoading: false, isError: true })],
  ])('aggregates error from %s', (_name, setup) => {
    setup();
    const { result } = renderHook(() => useMetadata('abc'));
    expect(result.current.isError).toBe(true);
  });

  it('resolves license ids against the licenses map and filters out unknown ids', () => {
    mockUseDataset.mockReturnValue({
      data: { ...baseDataset, licenses: ['lic-1', 'lic-missing'] } satisfies Dataset,
      isLoading: false,
      isError: false,
    });
    mockUseApiQuery.mockReturnValue({ data: [licenseA], isLoading: false, isError: false });

    const { result } = renderHook(() => useMetadata('abc'));

    expect(result.current.dataset?.licenses).toEqual([licenseA]);
  });

  it('derives soilProperties from measured_properties intersected with allSoilProperties', () => {
    mockUseDataset.mockReturnValue({
      data: {
        ...baseDataset,
        measured_properties: [
          { soil_property_id: 'sp-1', procedure_id: 'proc-1' },
          { soil_property_id: 'sp-2', procedure_id: 'proc-2' },
        ],
      } satisfies Dataset,
      isLoading: false,
      isError: false,
    });
    mockUseSoilProperties.mockReturnValue({ data: [soilPropPh, soilPropOc], isLoading: false, isError: false });

    const { result } = renderHook(() => useMetadata('abc'));

    expect(result.current.dataset?.soilProperties).toEqual(['pH']);
  });
});
