import { render, screen } from '@testing-library/react';
import { useLocation, useParams } from 'react-router';
import { DatasetsPublicationStepsLayout } from '../../src/layouts/DatasetsPublicationStepsLayout/DatasetsPublicationStepsLayout';
import useIngestionFlow from '../../src/hooks/useIngestionFlow';
import { useDataset } from 'hooks/useDatasets';

jest.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
  useLocation: jest.fn().mockReturnValue({ pathname: '/datasets/mock-dataset-id/mappings' }),
  useParams: jest.fn(),
}));

jest.mock('../../src/hooks/useIngestionFlow');

jest.mock('hooks/useDatasets', () => ({
  useDataset: jest.fn(),
}));

jest.mock('components/AdminPortal/LeaveIngestionModal/LeaveIngestionModal', () => ({
  LeaveIngestionModal: ({ visible, onContinue, onCancel }: { visible: boolean; onContinue: () => void; onCancel: () => void }) => (
    <div data-testid="leave-ingestion-modal" data-visible={String(visible)}>
      <button data-testid="modal-continue" onClick={onContinue} />
      <button data-testid="modal-cancel" onClick={onCancel} />
    </div>
  ),
}));

const mockUseIngestionFlow = useIngestionFlow as jest.Mock;
const mockUseDataset = useDataset as jest.Mock;
const mockUseParams = useParams as jest.Mock;
const mockUseLocation = useLocation as jest.Mock;

function mockIngestionFlow(overrides = {}) {
  mockUseIngestionFlow.mockReturnValue({
    isLeaveModalVisible: false,
    confirmLeave: jest.fn(),
    cancelLeave: jest.fn(),
    isRaster: false,
    setIsRaster: jest.fn(),
    ...overrides,
  });
}

describe('DatasetsPublicationStepsLayout', () => {
  beforeEach(() => {
    mockIngestionFlow();
    mockUseParams.mockReturnValue({ id: 'mock-dataset-id' });
    mockUseDataset.mockReturnValue({ data: undefined, isLoading: false });
    mockUseLocation.mockReturnValue({ pathname: '/datasets/mock-dataset-id/mappings' });
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

  describe('isLoading', () => {
    it('renders nothing while the dataset is loading', () => {
      mockUseDataset.mockReturnValue({ data: undefined, isLoading: true });
      const { container } = render(<DatasetsPublicationStepsLayout />);
      expect(container.firstChild).toBeNull();
    });

    it('renders the layout once loading is complete', () => {
      mockUseDataset.mockReturnValue({ data: undefined, isLoading: false });
      render(<DatasetsPublicationStepsLayout />);
      expect(screen.getByTestId('leave-ingestion-modal')).toBeInTheDocument();
    });
  });

  describe('setIsRaster', () => {
    it('calls setIsRaster(true) when dataset gis_datatype is raster', () => {
      const setIsRaster = jest.fn();
      mockIngestionFlow({ setIsRaster });
      mockUseDataset.mockReturnValue({ data: { gis_datatype: 'raster' }, isLoading: false });
      render(<DatasetsPublicationStepsLayout />);
      expect(setIsRaster).toHaveBeenCalledWith(true);
    });

    it('does not call setIsRaster when dataset gis_datatype is not raster', () => {
      const setIsRaster = jest.fn();
      mockIngestionFlow({ setIsRaster });
      mockUseDataset.mockReturnValue({ data: { gis_datatype: 'point' }, isLoading: false });
      render(<DatasetsPublicationStepsLayout />);
      expect(setIsRaster).not.toHaveBeenCalled();
    });

    it('does not call setIsRaster when dataset is not yet loaded', () => {
      const setIsRaster = jest.fn();
      mockIngestionFlow({ setIsRaster });
      mockUseDataset.mockReturnValue({ data: undefined, isLoading: false });
      render(<DatasetsPublicationStepsLayout />);
      expect(setIsRaster).not.toHaveBeenCalled();
    });
  });

  describe('step list', () => {
    it('renders 4 steps including preview for vector datasets', () => {
      const { container } = render(<DatasetsPublicationStepsLayout />);
      expect(container.querySelectorAll('.Step')).toHaveLength(4);
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('renders 3 steps without preview for raster datasets', () => {
      mockIngestionFlow({ isRaster: true });
      const { container } = render(<DatasetsPublicationStepsLayout />);
      expect(container.querySelectorAll('.Step')).toHaveLength(3);
      expect(screen.queryByText('Preview')).not.toBeInTheDocument();
    });
  });

  describe('active step', () => {
    it('marks mappings as active on the mappings path', () => {
      const { container } = render(<DatasetsPublicationStepsLayout />);
      const allSteps = container.querySelectorAll('.Step');
      expect(allSteps[2].classList.contains('Visited')).toBeTruthy();
      expect(allSteps[3].classList.contains('Visited')).toBeFalsy();
    });

    it('marks preview as active on the preview path', () => {
      mockUseLocation.mockReturnValue({ pathname: '/datasets/mock-dataset-id/preview' });
      const { container } = render(<DatasetsPublicationStepsLayout />);
      const allSteps = container.querySelectorAll('.Step');
      expect(allSteps[3].classList.contains('Visited')).toBeTruthy();
    });

    it('marks mappings as active on the mappings path for raster datasets (no preview step)', () => {
      mockIngestionFlow({ isRaster: true });
      const { container } = render(<DatasetsPublicationStepsLayout />);
      const allSteps = container.querySelectorAll('.Step');
      expect(allSteps).toHaveLength(3);
      expect(allSteps[2].classList.contains('Visited')).toBeTruthy();
    });
  });

  describe('LeaveIngestionModal', () => {
    it('renders with visible false by default', () => {
      render(<DatasetsPublicationStepsLayout />);
      expect(screen.getByTestId('leave-ingestion-modal')).toHaveAttribute('data-visible', 'false');
    });

    it('renders with visible true when isLeaveModalVisible is true', () => {
      mockIngestionFlow({ isLeaveModalVisible: true });
      render(<DatasetsPublicationStepsLayout />);
      expect(screen.getByTestId('leave-ingestion-modal')).toHaveAttribute('data-visible', 'true');
    });

    it('passes confirmLeave as onContinue', () => {
      const confirmLeave = jest.fn();
      mockIngestionFlow({ isLeaveModalVisible: true, confirmLeave });
      render(<DatasetsPublicationStepsLayout />);
      screen.getByTestId('modal-continue').click();
      expect(confirmLeave).toHaveBeenCalledTimes(1);
    });

    it('passes cancelLeave as onCancel', () => {
      const cancelLeave = jest.fn();
      mockIngestionFlow({ isLeaveModalVisible: true, cancelLeave });
      render(<DatasetsPublicationStepsLayout />);
      screen.getByTestId('modal-cancel').click();
      expect(cancelLeave).toHaveBeenCalledTimes(1);
    });
  });
});
