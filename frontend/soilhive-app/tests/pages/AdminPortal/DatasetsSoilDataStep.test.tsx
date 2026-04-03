import { render } from '@testing-library/react';
import { DatasetsSoilDataStep } from '../../../src/pages/AdminPortal/DatasetsSoilDataStep/DatasetsSoilDataStep';
import { useDatasetsSoilData } from 'hooks/useDatasetsSoilData';

jest.mock('hooks/useDatasetsSoilData', () => ({
  useDatasetsSoilData: jest.fn(),
  ALLOWED_EXTENSIONS: [],
}));

describe('DatasetsSoilDataStep', () => {
  beforeEach(() => {
    (useDatasetsSoilData as jest.Mock).mockReturnValue({
      fileInputRef: { current: null },
      soilDataFiles: [],
      uploadingFiles: [],
      isContinueEnabled: false,
      handleFiles: jest.fn(),
      handleCrsChange: jest.fn(),
      removeFile: jest.fn(),
      clearAll: jest.fn(),
      handlePrevious: jest.fn(),
      handleSaveAndContinueLater: jest.fn(),
      handleContinue: jest.fn(),
    });
  });

  it('renders matches snapshot', () => {
    const { container } = render(<DatasetsSoilDataStep />);
    expect(container).toMatchSnapshot();
  });
});
