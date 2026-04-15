import { renderHook, act } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { useMappingsStep } from 'hooks/useMappingsStep';
import { useApiQuery } from 'hooks/useApiQuery';
import { useSoilProperties } from 'hooks/useSoilProperties';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

// Factory mocks: real modules are never loaded, so window._env_ (read at
// module-load time by configuration/api.ts) is never accessed.
jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('hooks/useSoilProperties', () => ({
  useSoilProperties: jest.fn(),
}));

const mockUseApiQuery = useApiQuery as jest.Mock;
const mockUseSoilProperties = useSoilProperties as jest.Mock;

beforeEach(() => {
  mockUseApiQuery.mockReturnValue({ data: undefined, isLoading: false });
  mockUseSoilProperties.mockReturnValue({ data: undefined, isLoading: false });
});

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

    it('handleContinue navigates to the preview step', () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleContinue();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/preview');
    });

    it('handleSaveAndContinueLater navigates to the datasets list', () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleSaveAndContinueLater();
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
          { id: 'p1', property_name: 'Zinc', property_acronym: 'Zn', category_id: 'c1' },
          { id: 'p2', property_name: 'Aluminium', property_acronym: 'Al', category_id: 'c1' },
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
});
