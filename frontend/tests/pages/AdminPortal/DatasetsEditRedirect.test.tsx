import { render } from '@testing-library/react';
import { DatasetsEditRedirect } from '../../../src/pages/AdminPortal/DatasetsEditRedirect';
import { useIngestionStatus } from 'hooks/useIngestionStatus';
import { useDataset } from 'hooks/useDatasets';
import { IngestionStatus } from 'types/backend';

jest.mock('react-router', () => ({
  useParams: jest.fn(() => ({ id: 'my-dataset' })),
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
}));

jest.mock('hooks/useIngestionStatus', () => ({
  useIngestionStatus: jest.fn(),
}));

jest.mock('hooks/useDatasets', () => ({
  useDataset: jest.fn(),
}));

const mockUseIngestionStatus = useIngestionStatus as jest.MockedFunction<typeof useIngestionStatus>;
const mockUseDataset = useDataset as jest.Mock;

function setupIngestionStatus(isLoading: boolean, furthestStep: string) {
  mockUseIngestionStatus.mockReturnValue({
    isLoading,
    getFurthestStep: jest.fn(() => furthestStep as any),
    updateFurthestStep: jest.fn(),
    clearDatasetStatus: jest.fn(),
  });
}

function setupDataset(isLoading: boolean, status: IngestionStatus) {
  mockUseDataset.mockReturnValue({ data: { status }, isLoading });
}

describe('DatasetsEditRedirect', () => {
  beforeEach(() => {
    setupDataset(false, IngestionStatus.LOADED);
  });

  it('renders nothing while the ingestion config is loading', () => {
    setupIngestionStatus(true, 'general-info');
    const { container } = render(<DatasetsEditRedirect />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the dataset is loading', () => {
    setupIngestionStatus(false, 'general-info');
    setupDataset(true, IngestionStatus.LOADED);
    const { container } = render(<DatasetsEditRedirect />);
    expect(container).toBeEmptyDOMElement();
  });

  it('redirects to general-info when no step is stored for the dataset', () => {
    setupIngestionStatus(false, 'general-info');
    const { getByTestId } = render(<DatasetsEditRedirect />);
    expect(getByTestId('navigate')).toHaveAttribute('data-to', '/admin/datasets/edit/my-dataset/general-info');
  });

  it('redirects to the furthest stored step', () => {
    setupIngestionStatus(false, 'mappings');
    const { getByTestId } = render(<DatasetsEditRedirect />);
    expect(getByTestId('navigate')).toHaveAttribute('data-to', '/admin/datasets/edit/my-dataset/mappings');
  });

  it('redirects to settings when the dataset is PUBLISHED, ignoring the furthest step', () => {
    setupIngestionStatus(false, 'preview');
    setupDataset(false, IngestionStatus.PUBLISHED);
    const { getByTestId } = render(<DatasetsEditRedirect />);
    expect(getByTestId('navigate')).toHaveAttribute('data-to', '/admin/datasets/edit/my-dataset/settings');
  });
});
