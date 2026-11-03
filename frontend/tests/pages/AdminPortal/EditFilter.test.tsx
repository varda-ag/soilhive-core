import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { EditFilter } from '../../../src/pages/AdminPortal/EditFilter/EditFilter';
import { useEditFilter } from 'hooks/useEditFilter';
import { ADMIN_PATHS } from 'configuration/admin';

jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: () => ({ filterId: 'land_cover' }),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('hooks/useEditFilter', () => ({
  useEditFilter: jest.fn(),
}));

let capturedMappingsProps: any = {};

jest.mock('components/AdminPortal/RasterFilterForm/FilterMappings/FilterMappings', () => ({
  FilterMappings: (props: any) => {
    capturedMappingsProps = props;
    return <div data-testid="mock-filter-mappings" data-rows={props.rows.length} />;
  },
}));

jest.mock('components/AdminPortal/RasterFilterForm/FilterInstallingPanel/FilterInstallingPanel', () => ({
  FilterInstallingPanel: ({ progress }: { progress?: number }) => <div data-testid="mock-installing-panel" data-progress={progress} />,
}));

jest.mock('components/UI/Loader/Loader', () => ({
  Loader: () => <div data-testid="mock-loader" />,
}));

const handleChange = jest.fn();
const handleLabelChange = jest.fn();
const clearLabel = jest.fn();
const handleSave = jest.fn();

const filter = { id: 'land_cover', name: 'Land Cover', description: 'Copernicus land cover' };
const mappingRows = [
  { pixelValue: '1', label: 'Water' },
  { pixelValue: '2', label: '' },
];

// Defaults to an installed filter ready to be labelled
function buildHookMock(overrides: Record<string, unknown> = {}) {
  (useEditFilter as jest.Mock).mockReturnValue({
    filter,
    formData: { name: 'Land Cover', description: 'Copernicus land cover' },
    isLoading: false,
    isInstalling: false,
    installProgress: undefined,
    isInstalled: true,
    isEnabled: false,
    mappingRows,
    isSaveEnabled: true,
    handleChange,
    handleLabelChange,
    clearLabel,
    handleSave,
    ...overrides,
  });
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <EditFilter />
    </MemoryRouter>,
  );

const saveButton = () => screen.getByTestId('sh-edit-filter-save');

describe('EditFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedMappingsProps = {};
    buildHookMock();
  });

  it('edits the filter from the URL', () => {
    renderPage();

    expect(useEditFilter).toHaveBeenCalledWith('land_cover');
  });

  it('renders the back link to the filters list', () => {
    renderPage();

    expect(screen.getByText('createFilter.back').closest('a')).toHaveAttribute('href', ADMIN_PATHS.FILTERS);
  });

  describe('while the filter loads', () => {
    beforeEach(() => buildHookMock({ filter: undefined, isLoading: true, isInstalled: false, mappingRows: [] }));

    it('renders the loader', () => {
      renderPage();

      expect(screen.getByTestId('mock-loader')).toBeInTheDocument();
    });

    it('renders neither the description nor the labels', () => {
      renderPage();

      expect(screen.queryByText('createFilter.description_section.title')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-filter-mappings')).not.toBeInTheDocument();
    });
  });

  describe('while the install runs', () => {
    beforeEach(() => buildHookMock({ isInstalling: true, isInstalled: false, installProgress: 40, mappingRows: [] }));

    it('renders the installing panel with the progress', () => {
      renderPage();

      expect(screen.getByTestId('mock-installing-panel')).toHaveAttribute('data-progress', '40');
    });

    it('renders neither the loader, the description nor the labels', () => {
      renderPage();

      expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();
      expect(screen.queryByText('createFilter.description_section.title')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-filter-mappings')).not.toBeInTheDocument();
    });
  });

  describe('once installed', () => {
    it('renders neither the loader nor the installing panel', () => {
      renderPage();

      expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-installing-panel')).not.toBeInTheDocument();
    });

    it('renders the description section with the form values', () => {
      renderPage();

      expect(screen.getByRole('heading', { name: 'createFilter.description_section.title' })).toBeInTheDocument();
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue('Land Cover');
      expect(screen.getByTestId('sh-ui-textareafield')).toHaveValue('Copernicus land cover');
    });

    it('passes typing in the description section to the hook', () => {
      renderPage();

      fireEvent.change(screen.getByTestId('sh-ui-textareafield'), { target: { value: 'Land cover by Copernicus' } });

      expect(handleChange).toHaveBeenCalledWith('description', 'Land cover by Copernicus');
    });

    it('renders the labels section with the rows and handlers', () => {
      renderPage();

      expect(screen.getByRole('heading', { name: 'createFilter.mappings.title' })).toBeInTheDocument();
      expect(screen.getByText('createFilter.mappings.message')).toBeInTheDocument();
      expect(capturedMappingsProps).toEqual({ rows: mappingRows, onLabelChange: handleLabelChange, onClear: clearLabel });
    });

    it('labels the save button Save and finish for a filter that is not enabled yet', () => {
      renderPage();

      expect(saveButton()).toHaveTextContent('createFilter.save_and_finish');
    });

    it('labels the save button Save for an enabled filter', () => {
      buildHookMock({ isEnabled: true });
      renderPage();

      expect(saveButton()).toHaveTextContent(/^createFilter.save$/);
    });

    it('saves when the save button is clicked', () => {
      renderPage();

      fireEvent.click(saveButton());

      expect(handleSave).toHaveBeenCalledTimes(1);
    });

    it('disables the save button when the hook does not allow saving', () => {
      buildHookMock({ isSaveEnabled: false });
      renderPage();

      expect(saveButton()).toBeDisabled();
    });
  });

  describe('when the filter is created but not installed', () => {
    it('renders the description without the labels', () => {
      buildHookMock({ isInstalled: false, mappingRows: [] });
      renderPage();

      expect(screen.getByText('createFilter.description_section.title')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-filter-mappings')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-edit-filter-save')).not.toBeInTheDocument();
    });
  });
});
