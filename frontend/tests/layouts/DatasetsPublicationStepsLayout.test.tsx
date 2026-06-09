import { render, screen } from '@testing-library/react';
import { DatasetsPublicationStepsLayout } from '../../src/layouts/DatasetsPublicationStepsLayout/DatasetsPublicationStepsLayout';
import useIngestionFlow from '../../src/hooks/useIngestionFlow';

jest.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
  useLocation: jest.fn().mockReturnValue({ pathname: '/datasets/mock-dataset-id/mappings' }),
}));

jest.mock('../../src/hooks/useIngestionFlow');

jest.mock('components/AdminPortal/LeaveIngestionModal/LeaveIngestionModal', () => ({
  LeaveIngestionModal: ({ visible, onContinue, onCancel }: { visible: boolean; onContinue: () => void; onCancel: () => void }) => (
    <div data-testid="leave-ingestion-modal" data-visible={String(visible)}>
      <button data-testid="modal-continue" onClick={onContinue} />
      <button data-testid="modal-cancel" onClick={onCancel} />
    </div>
  ),
}));

const mockUseIngestionFlow = useIngestionFlow as jest.Mock;

function mockIngestionFlow(overrides = {}) {
  mockUseIngestionFlow.mockReturnValue({
    isLeaveModalVisible: false,
    confirmLeave: jest.fn(),
    cancelLeave: jest.fn(),
    ...overrides,
  });
}

describe('DatasetsPublicationStepsLayout', () => {
  beforeEach(() => {
    mockIngestionFlow();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders DatasetsPublicationStepsLayout and matches the snapshot', () => {
    const { container } = render(<DatasetsPublicationStepsLayout />);
    expect(container).toMatchSnapshot();
    const allSteps = container.querySelectorAll('.Step');
    expect(allSteps.length).toBe(4);
    // Step 2 is for the mappings
    expect(allSteps[2].classList.contains('Visited')).toBeTruthy();
    expect(allSteps[3].classList.contains('Visited')).toBeFalsy();
  });

  it('renders LeaveIngestionModal with visible false by default', () => {
    render(<DatasetsPublicationStepsLayout />);

    expect(screen.getByTestId('leave-ingestion-modal')).toHaveAttribute('data-visible', 'false');
  });

  it('renders LeaveIngestionModal with visible true when isLeaveModalVisible is true', () => {
    mockIngestionFlow({ isLeaveModalVisible: true });

    render(<DatasetsPublicationStepsLayout />);

    expect(screen.getByTestId('leave-ingestion-modal')).toHaveAttribute('data-visible', 'true');
  });

  it('passes confirmLeave as onContinue to LeaveIngestionModal', () => {
    const confirmLeave = jest.fn();
    mockIngestionFlow({ isLeaveModalVisible: true, confirmLeave });

    render(<DatasetsPublicationStepsLayout />);
    screen.getByTestId('modal-continue').click();

    expect(confirmLeave).toHaveBeenCalledTimes(1);
  });

  it('passes cancelLeave as onCancel to LeaveIngestionModal', () => {
    const cancelLeave = jest.fn();
    mockIngestionFlow({ isLeaveModalVisible: true, cancelLeave });

    render(<DatasetsPublicationStepsLayout />);
    screen.getByTestId('modal-cancel').click();

    expect(cancelLeave).toHaveBeenCalledTimes(1);
  });
});
