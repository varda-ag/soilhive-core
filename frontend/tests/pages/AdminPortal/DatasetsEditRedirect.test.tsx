import { render } from '@testing-library/react';
import { DatasetsEditRedirect } from '../../../src/pages/AdminPortal/DatasetsEditRedirect';
import { useIngestionStatus } from 'hooks/useIngestionStatus';

jest.mock('react-router', () => ({
  useParams: jest.fn(() => ({ id: 'my-dataset' })),
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
}));

jest.mock('hooks/useIngestionStatus', () => ({
  useIngestionStatus: jest.fn(),
}));

const mockUseIngestionStatus = useIngestionStatus as jest.MockedFunction<typeof useIngestionStatus>;

function setupIngestionStatus(isLoading: boolean, furthestStep: string) {
  mockUseIngestionStatus.mockReturnValue({
    isLoading,
    getFurthestStep: jest.fn(() => furthestStep as any),
    updateFurthestStep: jest.fn(),
    clearDatasetStatus: jest.fn(),
  });
}

describe('DatasetsEditRedirect', () => {
  it('renders nothing while the config is loading', () => {
    setupIngestionStatus(true, 'general-info');
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
});
