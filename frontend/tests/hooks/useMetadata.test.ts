import { renderHook } from '@testing-library/react';
import { useMetadata } from 'hooks/useMetadata';
import { useDataset } from 'hooks/useDatasets';
import { useApiQuery } from 'hooks/useApiQuery';
import { useSoilProperties } from 'hooks/useSoilProperties';
import { useUpdateDatasetMutation } from 'hooks/useDatasetMutation';
import { useQueryClient } from '@tanstack/react-query';
import type { Dataset, License, SoilProperty } from 'types/backend';
import { GISDataType, IngestionStatus } from 'types/backend';

jest.mock('hooks/useDatasets', () => ({ useDataset: jest.fn() }));
jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('hooks/useSoilProperties', () => ({ useSoilProperties: jest.fn() }));
jest.mock('hooks/useDatasetMutation', () => ({
  useUpdateDatasetMutation: jest.fn().mockReturnValue({ mutate: jest.fn(), mutateAsync: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: jest.fn().mockReturnValue({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

const mockUseDataset = useDataset as jest.Mock;
const mockUseApiQuery = useApiQuery as jest.Mock;
const mockUseSoilProperties = useSoilProperties as jest.Mock;
const mockUseUpdateDatasetMutation = useUpdateDatasetMutation as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;

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

  it('returns undefined soilProperties when dataset has no measured_properties', () => {
    mockUseDataset.mockReturnValue({ data: baseDataset, isLoading: false, isError: false });
    mockUseSoilProperties.mockReturnValue({ data: [soilPropPh], isLoading: false, isError: false });

    const { result } = renderHook(() => useMetadata('abc'));

    expect(result.current.dataset?.soilProperties).toBeUndefined();
  });

  it('returns allLicenses from the licenses query', () => {
    mockUseApiQuery.mockReturnValue({ data: [licenseA], isLoading: false, isError: false });

    const { result } = renderHook(() => useMetadata('abc'));

    expect(result.current.allLicenses).toEqual([licenseA]);
  });

  describe('inferredProperties', () => {
    it('returns an empty Set when dataset has no inferred_properties', () => {
      mockUseDataset.mockReturnValue({ data: baseDataset, isLoading: false, isError: false });

      const { result } = renderHook(() => useMetadata('abc'));

      expect(result.current.inferredProperties).toEqual(new Set());
    });

    it('returns a Set populated from inferred_properties', () => {
      mockUseDataset.mockReturnValue({
        data: { ...baseDataset, inferred_properties: ['measured_properties', 'licenses'] } satisfies Dataset,
        isLoading: false,
        isError: false,
      });

      const { result } = renderHook(() => useMetadata('abc'));

      expect(result.current.inferredProperties).toEqual(new Set(['measured_properties', 'licenses']));
    });
  });

  describe('updateProperty', () => {
    let mockMutate: jest.Mock;
    let mockInvalidateQueries: jest.Mock;

    beforeEach(() => {
      mockMutate = jest.fn();
      mockInvalidateQueries = jest.fn();
      mockUseUpdateDatasetMutation.mockReturnValue({ mutate: mockMutate });
      mockUseQueryClient.mockReturnValue({ invalidateQueries: mockInvalidateQueries });
      mockUseDataset.mockReturnValue({
        data: { ...baseDataset, name: 'MyDataset', soil_depth: { min: 5, max: 30 } } satisfies Dataset,
        isLoading: false,
        isError: false,
      });
    });

    it('calls onSuccess immediately when value matches the original', () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useMetadata('abc'));

      result.current.updateProperty('name', 'MyDataset', { onSuccess, onError: jest.fn() });

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('calls onSuccess immediately for soilProperties (null payload)', () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useMetadata('abc'));

      result.current.updateProperty('soilProperties', 'anything', { onSuccess, onError: jest.fn() });

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('calls mutate with the patch payload when value changed', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      result.current.updateProperty('name', 'NewName', { onSuccess: jest.fn(), onError: jest.fn() });

      expect(mockMutate).toHaveBeenCalledWith(
        { name: 'NewName' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('invalidates the dataset query and calls onSuccess after a successful mutation', () => {
      const onSuccess = jest.fn();
      mockMutate.mockImplementation((_payload: unknown, cbs: { onSuccess: () => void }) => cbs.onSuccess());
      const { result } = renderHook(() => useMetadata('abc'));

      result.current.updateProperty('name', 'NewName', { onSuccess, onError: jest.fn() });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['dataset', 'abc'] });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('calls onError with the error after a failed mutation', () => {
      const onError = jest.fn();
      const err = new Error('save failed');
      mockMutate.mockImplementation((_payload: unknown, cbs: { onError: (e: Error) => void }) => cbs.onError(err));
      const { result } = renderHook(() => useMetadata('abc'));

      result.current.updateProperty('name', 'NewName', { onSuccess: jest.fn(), onError });

      expect(onError).toHaveBeenCalledWith(err);
    });

    it('merges soil_depth_min into the existing soil_depth object', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      result.current.updateProperty('soil_depth_min', '10', { onSuccess: jest.fn(), onError: jest.fn() });

      expect(mockMutate).toHaveBeenCalledWith({ soil_depth: { min: 10, max: 30 } }, expect.any(Object));
    });

    it('removes soil_depth_min when value is empty string', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      result.current.updateProperty('soil_depth_min', '', { onSuccess: jest.fn(), onError: jest.fn() });

      expect(mockMutate).toHaveBeenCalledWith({ soil_depth: { min: undefined, max: 30 } }, expect.any(Object));
    });

    it('merges soil_depth_max into the existing soil_depth object', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      result.current.updateProperty('soil_depth_max', '100', { onSuccess: jest.fn(), onError: jest.fn() });

      expect(mockMutate).toHaveBeenCalledWith({ soil_depth: { min: 5, max: 100 } }, expect.any(Object));
    });

    it('wraps a non-empty license value in an array', () => {
      mockUseDataset.mockReturnValue({ data: { ...baseDataset, licenses: [] }, isLoading: false, isError: false });
      const { result } = renderHook(() => useMetadata('abc'));

      result.current.updateProperty('licenses', 'lic-2', { onSuccess: jest.fn(), onError: jest.fn() });

      expect(mockMutate).toHaveBeenCalledWith({ licenses: ['lic-2'] }, expect.any(Object));
    });

    it('sends an empty licenses array when value is empty string', () => {
      mockUseDataset.mockReturnValue({
        data: { ...baseDataset, licenses: ['lic-1'] } satisfies Dataset,
        isLoading: false,
        isError: false,
      });
      mockUseApiQuery.mockReturnValue({ data: [licenseA], isLoading: false, isError: false });
      const { result } = renderHook(() => useMetadata('abc'));

      result.current.updateProperty('licenses', '', { onSuccess: jest.fn(), onError: jest.fn() });

      expect(mockMutate).toHaveBeenCalledWith({ licenses: [] }, expect.any(Object));
    });

    it('sends null for a regular string property when value is empty', () => {
      mockUseDataset.mockReturnValue({
        data: { ...baseDataset, description: 'Old value' } satisfies Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      result.current.updateProperty('description', '', { onSuccess: jest.fn(), onError: jest.fn() });

      expect(mockMutate).toHaveBeenCalledWith({ description: null }, expect.any(Object));
    });
  });
});
