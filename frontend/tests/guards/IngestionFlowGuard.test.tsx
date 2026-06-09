import { render } from '@testing-library/react';
import { useBlocker } from 'react-router';
import { IngestionFlowGuard } from '../../src/guards/IngestionFlowGuard';
import useIngestionFlow from '../../src/hooks/useIngestionFlow';
import { ADMIN_PATHS } from '../../src/configuration/admin';

jest.mock('react-router', () => ({
  useBlocker: jest.fn(),
}));

jest.mock('../../src/hooks/useIngestionFlow');

const mockUseBlocker = useBlocker as jest.Mock;
const mockUseIngestionFlow = useIngestionFlow as jest.Mock;
const mockRequestLeave = jest.fn();

function makeBlocker(state: 'idle' | 'blocked' | 'proceeding', proceed = jest.fn(), reset = jest.fn()) {
  return { state, proceed, reset };
}

beforeEach(() => {
  mockUseIngestionFlow.mockReturnValue({ hasChanges: false, requestLeave: mockRequestLeave });
  mockUseBlocker.mockReturnValue(makeBlocker('idle'));
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('IngestionFlowGuard', () => {
  it('renders null', () => {
    const { container } = render(<IngestionFlowGuard />);
    expect(container.firstChild).toBeNull();
  });

  describe('blocker condition', () => {
    it('does not block when hasChanges is false', () => {
      render(<IngestionFlowGuard />);

      const condition = mockUseBlocker.mock.calls[0][0];
      expect(condition({ nextLocation: { pathname: '/admin/filters' } })).toBe(false);
      expect(condition({ nextLocation: { pathname: ADMIN_PATHS.DATASETS } })).toBe(false);
    });

    it('blocks when navigating outside the datasets section with unsaved changes', () => {
      mockUseIngestionFlow.mockReturnValue({ hasChanges: true, requestLeave: mockRequestLeave });
      render(<IngestionFlowGuard />);

      const condition = mockUseBlocker.mock.calls[0][0];
      expect(condition({ nextLocation: { pathname: '/admin/filters' } })).toBe(true);
      expect(condition({ nextLocation: { pathname: '/admin/terms-and-conditions' } })).toBe(true);
    });

    it('blocks when navigating to the datasets list root with unsaved changes', () => {
      mockUseIngestionFlow.mockReturnValue({ hasChanges: true, requestLeave: mockRequestLeave });
      render(<IngestionFlowGuard />);

      const condition = mockUseBlocker.mock.calls[0][0];
      expect(condition({ nextLocation: { pathname: ADMIN_PATHS.DATASETS } })).toBe(true);
    });

    it('does not block when navigating between datasets steps with unsaved changes', () => {
      mockUseIngestionFlow.mockReturnValue({ hasChanges: true, requestLeave: mockRequestLeave });
      render(<IngestionFlowGuard />);

      const condition = mockUseBlocker.mock.calls[0][0];
      expect(condition({ nextLocation: { pathname: `${ADMIN_PATHS.DATASETS}/new` } })).toBe(false);
      expect(condition({ nextLocation: { pathname: `${ADMIN_PATHS.DATASETS}/edit/123/general-info` } })).toBe(false);
      expect(condition({ nextLocation: { pathname: `${ADMIN_PATHS.DATASETS}/edit/123/soil-data` } })).toBe(false);
      expect(condition({ nextLocation: { pathname: `${ADMIN_PATHS.DATASETS}/edit/123/mappings` } })).toBe(false);
      expect(condition({ nextLocation: { pathname: `${ADMIN_PATHS.DATASETS}/edit/123/preview` } })).toBe(false);
    });
  });

  describe('when navigation is blocked', () => {
    it('calls requestLeave when blocker state is blocked', () => {
      mockUseBlocker.mockReturnValue(makeBlocker('blocked'));
      mockUseIngestionFlow.mockReturnValue({ hasChanges: true, requestLeave: mockRequestLeave });

      render(<IngestionFlowGuard />);

      expect(mockRequestLeave).toHaveBeenCalledTimes(1);
    });

    it('does not call requestLeave when blocker state is idle', () => {
      mockUseBlocker.mockReturnValue(makeBlocker('idle'));
      render(<IngestionFlowGuard />);

      expect(mockRequestLeave).not.toHaveBeenCalled();
    });

    it('calls blocker.proceed when onConfirm is invoked', () => {
      const mockProceed = jest.fn();
      mockUseBlocker.mockReturnValue(makeBlocker('blocked', mockProceed));
      mockUseIngestionFlow.mockReturnValue({ hasChanges: true, requestLeave: mockRequestLeave });

      render(<IngestionFlowGuard />);

      const [onConfirm] = mockRequestLeave.mock.calls[0];
      onConfirm();

      expect(mockProceed).toHaveBeenCalled();
    });

    it('calls blocker.reset when onCancel is invoked', () => {
      const mockReset = jest.fn();
      mockUseBlocker.mockReturnValue(makeBlocker('blocked', jest.fn(), mockReset));
      mockUseIngestionFlow.mockReturnValue({ hasChanges: true, requestLeave: mockRequestLeave });

      render(<IngestionFlowGuard />);

      const [, onCancel] = mockRequestLeave.mock.calls[0];
      onCancel();

      expect(mockReset).toHaveBeenCalled();
    });
  });

  describe('beforeunload handler', () => {
    it('adds beforeunload listener when hasChanges is true', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      mockUseIngestionFlow.mockReturnValue({ hasChanges: true, requestLeave: mockRequestLeave });

      render(<IngestionFlowGuard />);

      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });

    it('does not add beforeunload listener when hasChanges is false', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      mockUseIngestionFlow.mockReturnValue({ hasChanges: false, requestLeave: mockRequestLeave });

      render(<IngestionFlowGuard />);

      const beforeunloadCall = addEventListenerSpy.mock.calls.find(([event]) => event === 'beforeunload');
      expect(beforeunloadCall).toBeUndefined();
      addEventListenerSpy.mockRestore();
    });

    it('calls preventDefault on the beforeunload event', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      mockUseIngestionFlow.mockReturnValue({ hasChanges: true, requestLeave: mockRequestLeave });

      render(<IngestionFlowGuard />);

      const handler = addEventListenerSpy.mock.calls.find(([event]) => event === 'beforeunload')?.[1] as EventListener;
      const mockEvent = { preventDefault: jest.fn() } as unknown as Event;
      handler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      addEventListenerSpy.mockRestore();
    });

    it('removes beforeunload listener when hasChanges changes from true to false', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      mockUseIngestionFlow.mockReturnValue({ hasChanges: true, requestLeave: mockRequestLeave });
      const { rerender } = render(<IngestionFlowGuard />);

      const registeredHandler = addEventListenerSpy.mock.calls.find(([event]) => event === 'beforeunload')?.[1];

      mockUseIngestionFlow.mockReturnValue({ hasChanges: false, requestLeave: mockRequestLeave });
      rerender(<IngestionFlowGuard />);

      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', registeredHandler);
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });
  });
});
