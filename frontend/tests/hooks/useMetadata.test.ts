import { act, renderHook } from '@testing-library/react';
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

  describe('updateField', () => {
    beforeEach(() => {
      mockUseDataset.mockReturnValue({
        data: { ...baseDataset, name: 'MyDataset', soil_depth: { min: 5, max: 30 }, licenses: ['lic-1'] } satisfies Dataset,
        isLoading: false,
        isError: false,
      });
      mockUseApiQuery.mockReturnValue({ data: [licenseA], isLoading: false, isError: false });
    });

    it('updates a text field in local dataset state', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('name', 'NewName');
      });

      expect(result.current.dataset?.name).toBe('NewName');
    });

    it('sets a text field to null when value is empty string', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('name', '');
      });

      expect(result.current.dataset?.name).toBeNull();
    });

    it('updates soil_depth_min while preserving max', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('soil_depth_min', '10');
      });

      expect(result.current.dataset?.soil_depth).toMatchObject({ min: 10, max: 30 });
    });

    it('updates soil_depth_max while preserving min', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('soil_depth_max', '100');
      });

      expect(result.current.dataset?.soil_depth).toMatchObject({ min: 5, max: 100 });
    });

    it('sets soil_depth_min to undefined when value is empty string', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('soil_depth_min', '');
      });

      expect((result.current.dataset?.soil_depth as { min?: number } | null)?.min).toBeUndefined();
    });

    it('resolves a known license id to the full License object', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('licenses', 'lic-1');
      });

      expect(result.current.dataset?.licenses).toEqual([licenseA]);
    });

    it('creates a placeholder when license id is not in the map', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('licenses', 'lic-unknown');
      });

      expect(result.current.dataset?.licenses).toHaveLength(1);
      expect(result.current.dataset?.licenses[0].id).toBe('lic-unknown');
    });

    it('clears licenses when value is empty string', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('licenses', '');
      });

      expect(result.current.dataset?.licenses).toEqual([]);
    });

    it('updates related_resources with the provided array', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('related_resources', ['https://example.com']);
      });

      expect(result.current.dataset?.related_resources).toEqual(['https://example.com']);
    });
  });

  describe('validate', () => {
    const fullDataset = {
      ...baseDataset,
      name: 'My Dataset',
      full_name: 'My Full Dataset',
      author: 'Author Name',
      publication_date: '2024-01-01',
      description: '<p>Some description text</p>',
      soil_depth: { min: 0, max: 100 },
      reference_period_start: '2020-01-01',
      reference_period_stop: '2023-12-31',
      licenses: ['lic-1'],
    } as unknown as Dataset;

    beforeEach(() => {
      mockUseApiQuery.mockReturnValue({ data: [licenseA], isLoading: false, isError: false });
    });

    it('returns true without errors when dataset is undefined', () => {
      mockUseDataset.mockReturnValue({ data: undefined, isLoading: false, isError: false });
      const { result } = renderHook(() => useMetadata('abc'));

      let isValid!: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid).toBe(true);
      expect(result.current.fieldErrors.size).toBe(0);
    });

    it('returns true when all required fields are filled', () => {
      mockUseDataset.mockReturnValue({ data: fullDataset, isLoading: false, isError: false });
      const { result } = renderHook(() => useMetadata('abc'));

      let isValid!: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid).toBe(true);
      expect(result.current.fieldErrors.size).toBe(0);
    });

    it('returns false and populates fieldErrors when validation fails', () => {
      mockUseDataset.mockReturnValue({
        data: { ...fullDataset, name: null, author: null } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      let isValid!: boolean;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid).toBe(false);
      expect(result.current.fieldErrors.has('name')).toBe(true);
      expect(result.current.fieldErrors.has('author')).toBe(true);
    });

    it.each(['name', 'full_name', 'author', 'publication_date'] as const)('adds "%s" to fieldErrors when field is null', field => {
      mockUseDataset.mockReturnValue({
        data: { ...fullDataset, [field]: null } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has(field)).toBe(true);
    });

    it('adds "description" to fieldErrors when description has no text content', () => {
      mockUseDataset.mockReturnValue({
        data: { ...fullDataset, description: '<p></p>' } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has('description')).toBe(true);
    });

    it('does not add "description" to fieldErrors when description has text', () => {
      mockUseDataset.mockReturnValue({ data: fullDataset, isLoading: false, isError: false });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has('description')).toBe(false);
    });

    it('adds soil_depth_min and soil_depth_max to fieldErrors when depth is null and not inferred', () => {
      mockUseDataset.mockReturnValue({
        data: { ...fullDataset, soil_depth: null } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has('soil_depth_min')).toBe(true);
      expect(result.current.fieldErrors.has('soil_depth_max')).toBe(true);
    });

    it('skips soil_depth validation when soil_depth is inferred', () => {
      mockUseDataset.mockReturnValue({
        data: { ...fullDataset, soil_depth: null, inferred_properties: ['soil_depth'] } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has('soil_depth_min')).toBe(false);
      expect(result.current.fieldErrors.has('soil_depth_max')).toBe(false);
    });

    it('does not add soil_depth errors when min and max are 0 (falsy but valid)', () => {
      mockUseDataset.mockReturnValue({
        data: { ...fullDataset, soil_depth: { min: 0, max: 0 } } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has('soil_depth_min')).toBe(false);
      expect(result.current.fieldErrors.has('soil_depth_max')).toBe(false);
    });

    it('adds reference_period_start to fieldErrors when null and not inferred', () => {
      mockUseDataset.mockReturnValue({
        data: { ...fullDataset, reference_period_start: null } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has('reference_period_start')).toBe(true);
    });

    it('skips reference_period_start when it is inferred', () => {
      mockUseDataset.mockReturnValue({
        data: {
          ...fullDataset,
          reference_period_start: null,
          inferred_properties: ['reference_period_start'],
        } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has('reference_period_start')).toBe(false);
    });

    it('adds reference_period_stop to fieldErrors when null and not inferred', () => {
      mockUseDataset.mockReturnValue({
        data: { ...fullDataset, reference_period_stop: null } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has('reference_period_stop')).toBe(true);
    });

    it('skips reference_period_stop when it is inferred', () => {
      mockUseDataset.mockReturnValue({
        data: {
          ...fullDataset,
          reference_period_stop: null,
          inferred_properties: ['reference_period_stop'],
        } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has('reference_period_stop')).toBe(false);
    });

    it('adds "licenses" to fieldErrors when licenses is empty and not inferred', () => {
      mockUseDataset.mockReturnValue({
        data: { ...fullDataset, licenses: [] } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has('licenses')).toBe(true);
    });

    it('skips licenses validation when licenses is inferred', () => {
      mockUseDataset.mockReturnValue({
        data: { ...fullDataset, licenses: [], inferred_properties: ['licenses'] } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });

      expect(result.current.fieldErrors.has('licenses')).toBe(false);
    });
  });

  describe('handleFieldChange', () => {
    beforeEach(() => {
      mockUseDataset.mockReturnValue({
        data: { ...baseDataset, name: null, full_name: null, licenses: [] } as unknown as Dataset,
        isLoading: false,
        isError: false,
      });
    });

    it('updates the field in dataset state', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.handleFieldChange('name', 'New Name');
      });

      expect(result.current.dataset?.name).toBe('New Name');
    });

    it('removes the field from fieldErrors when it was in the error set', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });
      expect(result.current.fieldErrors.has('name')).toBe(true);

      act(() => {
        result.current.handleFieldChange('name', 'New Name');
      });

      expect(result.current.fieldErrors.has('name')).toBe(false);
    });

    it('preserves other field errors when clearing one specific field', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.validate();
      });
      expect(result.current.fieldErrors.has('name')).toBe(true);
      expect(result.current.fieldErrors.has('full_name')).toBe(true);

      act(() => {
        result.current.handleFieldChange('name', 'Fixed Name');
      });

      expect(result.current.fieldErrors.has('name')).toBe(false);
      expect(result.current.fieldErrors.has('full_name')).toBe(true);
    });

    it('does not update the fieldErrors reference when field was not in the error set', () => {
      mockUseDataset.mockReturnValue({
        data: { ...baseDataset, name: 'DS1', licenses: [] } satisfies Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      const errorsBefore = result.current.fieldErrors;

      act(() => {
        result.current.handleFieldChange('name', 'New Name');
      });

      expect(result.current.fieldErrors).toBe(errorsBefore);
    });
  });

  describe('saveAll', () => {
    let mockMutate: jest.Mock;
    let mockInvalidateQueries: jest.Mock;

    beforeEach(() => {
      mockMutate = jest.fn();
      mockInvalidateQueries = jest.fn();
      mockUseUpdateDatasetMutation.mockReturnValue({ mutate: mockMutate });
      mockUseQueryClient.mockReturnValue({ invalidateQueries: mockInvalidateQueries });
      mockUseDataset.mockReturnValue({
        data: { ...baseDataset, name: 'MyDataset', licenses: [] } satisfies Dataset,
        isLoading: false,
        isError: false,
      });
    });

    it('calls onSuccess immediately when dataset is undefined', () => {
      mockUseDataset.mockReturnValue({ data: undefined, isLoading: false, isError: false });
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.saveAll({ onSuccess, onError: jest.fn() });
      });

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('calls onSuccess immediately when nothing changed', () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.saveAll({ onSuccess, onError: jest.fn() });
      });

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('sends a patch with changed text fields', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('name', 'NewName');
      });
      act(() => {
        result.current.saveAll({ onSuccess: jest.fn(), onError: jest.fn() });
      });

      expect(mockMutate).toHaveBeenCalledWith(
        { name: 'NewName' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('sends null for a text field cleared to empty string', () => {
      mockUseDataset.mockReturnValue({
        data: { ...baseDataset, description: 'Old value', licenses: [] } satisfies Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('description', '');
      });
      act(() => {
        result.current.saveAll({ onSuccess: jest.fn(), onError: jest.fn() });
      });

      expect(mockMutate).toHaveBeenCalledWith({ description: null }, expect.any(Object));
    });

    it('sends soil_depth patch when depth changed', () => {
      mockUseDataset.mockReturnValue({
        data: { ...baseDataset, soil_depth: { min: 5, max: 30 }, licenses: [] } satisfies Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('soil_depth_min', '10');
      });
      act(() => {
        result.current.saveAll({ onSuccess: jest.fn(), onError: jest.fn() });
      });

      expect(mockMutate).toHaveBeenCalledWith({ soil_depth: { min: 10, max: 30 } }, expect.any(Object));
    });

    it('sends licenses patch when licenses changed', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('licenses', 'lic-1');
      });
      act(() => {
        result.current.saveAll({ onSuccess: jest.fn(), onError: jest.fn() });
      });

      expect(mockMutate).toHaveBeenCalledWith({ licenses: ['lic-1'] }, expect.any(Object));
    });

    it('sends related_resources patch when urls changed', () => {
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('related_resources', ['https://example.com']);
      });
      act(() => {
        result.current.saveAll({ onSuccess: jest.fn(), onError: jest.fn() });
      });

      expect(mockMutate).toHaveBeenCalledWith({ related_resources: ['https://example.com'] }, expect.any(Object));
    });

    it('sends related_resources as null when the new value is an empty array', () => {
      mockUseDataset.mockReturnValue({
        data: { ...baseDataset, related_resources: ['https://example.com'], licenses: [] } satisfies Dataset,
        isLoading: false,
        isError: false,
      });
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('related_resources', []);
      });
      act(() => {
        result.current.saveAll({ onSuccess: jest.fn(), onError: jest.fn() });
      });

      expect(mockMutate).toHaveBeenCalledWith({ related_resources: null }, expect.any(Object));
    });

    it('invalidates the dataset query and calls onSuccess after a successful mutation', () => {
      const onSuccess = jest.fn();
      mockMutate.mockImplementation((_payload: unknown, cbs: { onSuccess: () => void }) => cbs.onSuccess());
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('name', 'NewName');
      });
      act(() => {
        result.current.saveAll({ onSuccess, onError: jest.fn() });
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['dataset', 'abc'] });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('calls onError after a failed mutation', () => {
      const onError = jest.fn();
      const err = new Error('save failed');
      mockMutate.mockImplementation((_payload: unknown, cbs: { onError: (e: Error) => void }) => cbs.onError(err));
      const { result } = renderHook(() => useMetadata('abc'));

      act(() => {
        result.current.updateField('name', 'NewName');
      });
      act(() => {
        result.current.saveAll({ onSuccess: jest.fn(), onError });
      });

      expect(onError).toHaveBeenCalledWith(err);
    });
  });
});
