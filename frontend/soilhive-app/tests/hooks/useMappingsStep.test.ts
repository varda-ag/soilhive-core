import { renderHook, act } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { useMappingsStep } from 'hooks/useMappingsStep';
import { useApiQuery } from 'hooks/useApiQuery';
import { useSoilProperties } from 'hooks/useSoilProperties';
import { useCreateProcedureMutation } from 'hooks/useCreateProcedureMutation';
import { useCreateMappingsMutation } from 'hooks/useCreateMappingsMutation';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('hooks/useApiQueries', () => ({
  useApiQueries: jest.fn(() => []),
}));

jest.mock('hooks/useSoilProperties', () => ({
  useSoilProperties: jest.fn(),
}));

jest.mock('hooks/useCreateProcedureMutation', () => ({
  useCreateProcedureMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

jest.mock('hooks/useCreateMappingsMutation', () => ({
  useCreateMappingsMutation: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue({ id: 'mapping-1', data_mapping: {} }),
  })),
}));

jest.mock('hooks/useDatasetMutation', () => ({
  useUpdateDatasetFileMappingMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn().mockResolvedValue(undefined) })),
}));

const mockUseApiQuery = useApiQuery as jest.Mock;
const mockUseSoilProperties = useSoilProperties as jest.Mock;

beforeEach(() => {
  mockUseApiQuery.mockReturnValue({ data: undefined, isLoading: false });
  mockUseSoilProperties.mockReturnValue({ data: undefined, isLoading: false });
});

function setupWithColumns(columns: string[]) {
  // Stable reference — new array per call would re-trigger the columnMappings useEffect on every render.
  const filesData = [{ metadata: { field_names: columns } }];
  mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint.includes('/files')) {
      return { data: filesData, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  });
}

describe('useMappingsStep', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    mockNavigate.mockClear();
  });

  describe('initial state', () => {
    it('has no expanded rows', () => {
      const { result } = renderHook(() => useMappingsStep('1'));
      expect(result.current.expandedRows.size).toBe(0);
    });
  });

  describe('navigation', () => {
    it('handlePrevious navigates to the soil-data step', () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handlePrevious();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/soil-data');
    });

    it('handleContinue navigates to the preview step', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/preview');
    });

    it('handleSaveAndContinueLater navigates to the datasets list', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      await act(async () => {
        await result.current.handleSaveAndContinueLater();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets');
    });
  });

  describe('conceptOptions', () => {
    it('always includes the hardcoded detectable field options', () => {
      const { result } = renderHook(() => useMappingsStep('1'));
      const codes = result.current.conceptOptions.map(o => o.code);
      expect(codes).toContain('geometry');
      expect(codes).toContain('latitude');
      expect(codes).toContain('longitude');
      expect(codes).toContain('sampling_date');
      expect(codes).toContain('license');
    });

    it('appends soil properties sorted alphabetically after the detectable fields', () => {
      mockUseSoilProperties.mockReturnValue({
        data: [
          { id: 'p1', property_name: 'Zinc', property_acronym: 'Zn', category_id: 'c1', original_units_of_measurement: [] },
          { id: 'p2', property_name: 'Aluminium', property_acronym: 'Al', category_id: 'c1', original_units_of_measurement: [] },
        ],
        isLoading: false,
      });
      const { result } = renderHook(() => useMappingsStep('1'));
      const options = result.current.conceptOptions;
      const detectableCount = 9; // DETECTABLE_FIELD_OPTIONS length
      expect(options[detectableCount]).toEqual({ code: 'p2', name: 'Aluminium' });
      expect(options[detectableCount + 1]).toEqual({ code: 'p1', name: 'Zinc' });
    });
  });

  describe('save', () => {
    let mockCreateProcedure: jest.Mock;
    let mockCreateMapping: jest.Mock;

    beforeEach(() => {
      mockCreateProcedure = jest.fn().mockResolvedValue({ id: 'proc-1' });
      mockCreateMapping = jest.fn().mockResolvedValue({ id: 'mapping-1', data_mapping: {} });
      (useCreateProcedureMutation as jest.Mock).mockReturnValue({ mutateAsync: mockCreateProcedure });
      (useCreateMappingsMutation as jest.Mock).mockReturnValue({ mutateAsync: mockCreateMapping });
      setupWithColumns(['col1', 'col2']);
    });

    it('saves a metadata field as a plain string', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'geometry');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ col1: 'geometry' }));
      expect(mockCreateProcedure).not.toHaveBeenCalled();
    });

    it('saves a soil property without unit as { property_id }', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ col1: { property_id: 'soil-ph' } }));
      expect(mockCreateProcedure).not.toHaveBeenCalled();
    });

    it('saves a soil property with unit as { property_id, conversion_id }', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
        result.current.handleUnitChange('col1', 'mg/kg');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ col1: { property_id: 'soil-ph', conversion_id: 'mg/kg' } }));
      expect(mockCreateProcedure).not.toHaveBeenCalled();
    });

    it('creates a procedure and links its id when detail fields are filled', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
        result.current.handleDetailChange('col1', 'technique', 'acid_digestion');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateProcedure).toHaveBeenCalledWith(expect.objectContaining({ technique: 'acid_digestion' }));
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ col1: { property_id: 'soil-ph', procedure_id: 'proc-1' } }));
    });

    it('excludes unmapped columns from the mapping request', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'geometry');
        // col2 intentionally left unmapped
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      const payload = mockCreateMapping.mock.calls[0][0];
      expect(payload).not.toHaveProperty('col2');
    });
  });
});
