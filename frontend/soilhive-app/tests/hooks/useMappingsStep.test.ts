import { renderHook, act } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { useMappingsStep } from 'hooks/useMappingsStep';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

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
});
