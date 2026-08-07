import { render, screen } from '@testing-library/react';
import { DatasetsSoilDataStep } from '../../../src/pages/AdminPortal/DatasetsSoilDataStep/DatasetsSoilDataStep';
import { useDatasetsSoilData } from 'hooks/useDatasetsSoilData';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <>{i18nKey}</>,
}));

jest.mock('hooks/useDatasetsSoilData', () => ({
  useDatasetsSoilData: jest.fn(),
  ALLOWED_EXTENSIONS: [],
}));

function buildHookMock(overrides: Record<string, unknown> = {}) {
  (useDatasetsSoilData as jest.Mock).mockReturnValue({
    fileInputRef: { current: null },
    soilDataFiles: [],
    uploadingFiles: [],
    isContinueEnabled: false,
    isSaving: false,
    handleFiles: jest.fn(),
    handleCrsChange: jest.fn(),
    removeFile: jest.fn(),
    clearAll: jest.fn(),
    handlePrevious: jest.fn(),
    handleSaveAndContinueLater: jest.fn(),
    handleContinue: jest.fn(),
    ...overrides,
  });
}

describe('DatasetsSoilDataStep', () => {
  beforeEach(() => {
    buildHookMock();
  });

  it('renders matches snapshot', () => {
    const { container } = render(<DatasetsSoilDataStep />);
    expect(container).toMatchSnapshot();
  });

  it('disables Continue and Save-and-continue-later while a save is in flight, even if otherwise enabled', () => {
    buildHookMock({ isContinueEnabled: true, isSaving: true });
    render(<DatasetsSoilDataStep />);

    expect(screen.getByText('datasets.actions.continue').closest('button')).toBeDisabled();
    expect(screen.getByText('datasets.actions.save_and_continue_later').closest('button')).toBeDisabled();
  });

  it('enables Continue and Save-and-continue-later once isContinueEnabled is true and no save is in flight', () => {
    buildHookMock({ isContinueEnabled: true, isSaving: false });
    render(<DatasetsSoilDataStep />);

    expect(screen.getByText('datasets.actions.continue').closest('button')).toBeEnabled();
    expect(screen.getByText('datasets.actions.save_and_continue_later').closest('button')).toBeEnabled();
  });
});
