import { type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';

import { IngestionFlowProvider } from '../../src/contexts/IngestionFlowContext';
import useIngestionFlow from '../../src/hooks/useIngestionFlow';

const wrapper = ({ children }: PropsWithChildren) => <IngestionFlowProvider>{children}</IngestionFlowProvider>;

describe('IngestionFlowProvider / useIngestionFlow', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws when used outside provider', () => {
    expect(() => renderHook(() => useIngestionFlow())).toThrow('useIngestionFlow must be used within an IngestionFlowProvider');
  });

  it('returns correct initial state', () => {
    const { result } = renderHook(() => useIngestionFlow(), { wrapper });

    expect(result.current.hasChanges).toBe(false);
    expect(result.current.isLeaveModalVisible).toBe(false);
    expect(typeof result.current.markAsChanged).toBe('function');
    expect(typeof result.current.resetChanges).toBe('function');
    expect(typeof result.current.requestLeave).toBe('function');
    expect(typeof result.current.confirmLeave).toBe('function');
    expect(typeof result.current.cancelLeave).toBe('function');
  });

  describe('markAsChanged', () => {
    it('sets hasChanges to true', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });

      act(() => {
        result.current.markAsChanged();
      });

      expect(result.current.hasChanges).toBe(true);
    });

    it('is idempotent when called multiple times', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });

      act(() => {
        result.current.markAsChanged();
        result.current.markAsChanged();
      });

      expect(result.current.hasChanges).toBe(true);
    });
  });

  describe('resetChanges', () => {
    it('sets hasChanges to false', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });

      act(() => {
        result.current.markAsChanged();
      });

      act(() => {
        result.current.resetChanges();
      });

      expect(result.current.hasChanges).toBe(false);
    });

    it('is a no-op when hasChanges is already false', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });

      act(() => {
        result.current.resetChanges();
      });

      expect(result.current.hasChanges).toBe(false);
    });
  });

  describe('requestLeave', () => {
    it('shows the leave modal', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });

      act(() => {
        result.current.requestLeave(jest.fn(), jest.fn());
      });

      expect(result.current.isLeaveModalVisible).toBe(true);
    });

    it('overrides previous handlers when called again', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });
      const firstConfirm = jest.fn();
      const secondConfirm = jest.fn();

      act(() => {
        result.current.requestLeave(firstConfirm, jest.fn());
      });

      act(() => {
        result.current.requestLeave(secondConfirm, jest.fn());
      });

      act(() => {
        result.current.confirmLeave();
      });

      expect(secondConfirm).toHaveBeenCalled();
      expect(firstConfirm).not.toHaveBeenCalled();
    });
  });

  describe('confirmLeave', () => {
    it('calls the onConfirm callback', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });
      const onConfirm = jest.fn();

      act(() => {
        result.current.requestLeave(onConfirm, jest.fn());
      });

      act(() => {
        result.current.confirmLeave();
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('sets hasChanges to false', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });

      act(() => {
        result.current.markAsChanged();
        result.current.requestLeave(jest.fn(), jest.fn());
      });

      act(() => {
        result.current.confirmLeave();
      });

      expect(result.current.hasChanges).toBe(false);
    });

    it('hides the leave modal', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });

      act(() => {
        result.current.requestLeave(jest.fn(), jest.fn());
      });

      act(() => {
        result.current.confirmLeave();
      });

      expect(result.current.isLeaveModalVisible).toBe(false);
    });

    it('does not call onConfirm again after handlers are cleared', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });
      const onConfirm = jest.fn();

      act(() => {
        result.current.requestLeave(onConfirm, jest.fn());
      });

      act(() => {
        result.current.confirmLeave();
      });

      act(() => {
        result.current.confirmLeave();
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelLeave', () => {
    it('calls the onCancel callback', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });
      const onCancel = jest.fn();

      act(() => {
        result.current.requestLeave(jest.fn(), onCancel);
      });

      act(() => {
        result.current.cancelLeave();
      });

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('hides the leave modal', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });

      act(() => {
        result.current.requestLeave(jest.fn(), jest.fn());
      });

      act(() => {
        result.current.cancelLeave();
      });

      expect(result.current.isLeaveModalVisible).toBe(false);
    });

    it('does not change hasChanges', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });

      act(() => {
        result.current.markAsChanged();
        result.current.requestLeave(jest.fn(), jest.fn());
      });

      act(() => {
        result.current.cancelLeave();
      });

      expect(result.current.hasChanges).toBe(true);
    });

    it('does not call onCancel again after handlers are cleared', () => {
      const { result } = renderHook(() => useIngestionFlow(), { wrapper });
      const onCancel = jest.fn();

      act(() => {
        result.current.requestLeave(jest.fn(), onCancel);
      });

      act(() => {
        result.current.cancelLeave();
      });

      act(() => {
        result.current.cancelLeave();
      });

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });
});
