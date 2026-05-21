import { render } from '@testing-library/react';
import { DatasetsPreviewStep } from '../../../src/pages/AdminPortal/DatasetsPreviewStep/DatasetsPreviewStep';

jest.mock('hooks/useIngestionStatus', () => ({
  useIngestionStatus: jest.fn(() => ({
    isLoading: false,
    getFurthestStep: jest.fn(() => 'general-info'),
    updateFurthestStep: jest.fn(),
    clearDatasetStatus: jest.fn(),
  })),
}));

describe('DatasetsPreviewStep', () => {
  it('renders matches snapshot', () => {
    const { container } = render(<DatasetsPreviewStep />);
    expect(container).toMatchSnapshot();
  });
});
