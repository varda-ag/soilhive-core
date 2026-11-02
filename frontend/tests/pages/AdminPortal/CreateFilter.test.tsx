import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CreateFilter } from '../../../src/pages/AdminPortal/CreateFilter/CreateFilter';
import { useCreateFilter } from 'hooks/useCreateFilter';
import { useStorageConfig } from 'hooks/useStorageConfig';
import { ADMIN_PATHS } from 'configuration/admin';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <>{i18nKey}</>,
}));

jest.mock('hooks/useCreateFilter', () => ({
  useCreateFilter: jest.fn(),
  FILTER_ALLOWED_EXTENSIONS: ['.tif', '.tiff'],
}));

jest.mock('hooks/useStorageConfig', () => ({
  useStorageConfig: jest.fn(),
}));

let capturedUploadBoxProps: any = {};
let capturedFileRowProps: any = {};

jest.mock('components/UI/FileUploadBox/FileUploadBox', () => ({
  FileUploadBox: (props: any) => {
    capturedUploadBoxProps = props;
    return <div data-testid="mock-upload-box">{props.caption}</div>;
  },
}));

jest.mock('../../../src/pages/AdminPortal/DatasetsSoilDataStep/SoilDataFileRow/SoilDataFileRow', () => ({
  SoilDataFileRow: (props: any) => {
    capturedFileRowProps = props;
    return <div data-testid="mock-file-row">{props.soilDataFile.name}</div>;
  },
}));

jest.mock('components/UI/Loader/Loader', () => ({
  Loader: () => <div data-testid="mock-loader" />,
}));

const handleFiles = jest.fn();
const handleCrsChange = jest.fn();
const handleCrsSelect = jest.fn();
const removeFile = jest.fn();
const handleChange = jest.fn();
const handleInstall = jest.fn();

const filterFile = { id: 'file-1', file: null, name: 'land_cover.tif', progress: 100, crs: null, inferredCrs: 'EPSG:4326', error: null };
const crsOptions = [{ code: 4326, name: 'WGS 84' }];

function buildHookMock(overrides: Record<string, unknown> = {}) {
  (useCreateFilter as jest.Mock).mockReturnValue({
    fileInputRef: { current: null },
    filterFile: null,
    uploadingFiles: [],
    uploadProgress: {},
    uploadErrors: [],
    crsOptions,
    handleFiles,
    handleCrsChange,
    handleCrsSelect,
    removeFile,
    formData: { name: '', description: '' },
    isCreating: false,
    isInstallEnabled: false,
    handleChange,
    handleInstall,
    ...overrides,
  });
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <CreateFilter />
    </MemoryRouter>,
  );

const installButton = () => screen.getByText('createFilter.install').closest('button');

describe('CreateFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedUploadBoxProps = {};
    capturedFileRowProps = {};
    buildHookMock();
    (useStorageConfig as jest.Mock).mockReturnValue({
      storageConfig: { storageMode: 'local', maxUploadSizeMB: 500 },
      isLoading: false,
      isError: false,
    });
  });

  it('renders the back link to the filters list', () => {
    renderPage();

    expect(screen.getByText('createFilter.back').closest('a')).toHaveAttribute('href', ADMIN_PATHS.FILTERS);
  });

  it('renders the upload section title and message', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'createFilter.title' })).toBeInTheDocument();
    expect(screen.getByText('createFilter.message')).toBeInTheDocument();
  });

  describe('upload box', () => {
    it('accepts a single GeoTIFF file', () => {
      renderPage();

      expect(capturedUploadBoxProps.accept).toBe('.tif, .tiff');
      expect(capturedUploadBoxProps.isSingleFileUpload).toBe(true);
    });

    it('hands the dropped files to the hook', () => {
      renderPage();

      expect(capturedUploadBoxProps.handleFiles).toBe(handleFiles);
    });

    it('shows the uploading files, their progress and the upload errors', () => {
      const uploadingFiles = [new File([''], 'land_cover.tif')];
      buildHookMock({ uploadingFiles, uploadProgress: { 'land_cover.tif': [40] }, uploadErrors: ['land_cover.tif: Invalid file type'] });
      renderPage();

      expect(capturedUploadBoxProps.files).toBe(uploadingFiles);
      expect(capturedUploadBoxProps.uploadProgress).toEqual({ 'land_cover.tif': [40] });
      expect(capturedUploadBoxProps.errorMessage).toEqual(['land_cover.tif: Invalid file type']);
    });

    it('appends the max upload size to the caption', () => {
      renderPage();

      expect(screen.getByText('createFilter.upload_caption datasets.soil_data.max_size_caption {"size":"500 MB"}')).toBeInTheDocument();
    });

    it('shows only the formats in the caption when the max upload size is unknown', () => {
      (useStorageConfig as jest.Mock).mockReturnValue({ storageConfig: undefined, isLoading: true, isError: false });
      renderPage();

      expect(screen.getByTestId('mock-upload-box')).toHaveTextContent(/^createFilter.upload_caption$/);
    });
  });

  describe('without an uploaded file', () => {
    it('renders neither the file row nor the description section', () => {
      renderPage();

      expect(screen.queryByTestId('mock-file-row')).not.toBeInTheDocument();
      expect(screen.queryByText('createFilter.description_section.title')).not.toBeInTheDocument();
      expect(screen.queryByText('createFilter.install')).not.toBeInTheDocument();
    });
  });

  describe('with an uploaded file', () => {
    beforeEach(() => buildHookMock({ filterFile }));

    it('renders the file count and the file row', () => {
      renderPage();

      expect(screen.getByText('datasets.soil_data.files_uploaded_count {"count":1}')).toBeInTheDocument();
      expect(screen.getByTestId('mock-file-row')).toHaveTextContent('land_cover.tif');
    });

    it('passes the file, the CRS options and the handlers to the file row, without NODATA', () => {
      renderPage();

      expect(capturedFileRowProps).toEqual(
        expect.objectContaining({
          soilDataFile: filterFile,
          crsOptions,
          onCrsChange: handleCrsChange,
          onCrsSelect: handleCrsSelect,
          onRemove: removeFile,
          showNoData: false,
        }),
      );
    });

    it('renders the description section', () => {
      renderPage();

      expect(screen.getByRole('heading', { name: 'createFilter.description_section.title' })).toBeInTheDocument();
      expect(screen.getByText('createFilter.description_section.message')).toBeInTheDocument();
    });

    it('renders the form values and passes typing to the hook', () => {
      buildHookMock({ filterFile, formData: { name: 'Land Cover', description: 'Copernicus land cover' } });
      renderPage();

      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue('Land Cover');
      expect(screen.getByTestId('sh-ui-textareafield')).toHaveValue('Copernicus land cover');

      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'Land Cover 2024' } });

      expect(handleChange).toHaveBeenCalledWith('name', 'Land Cover 2024');
    });

    it('disables Install filter until the hook allows it', () => {
      renderPage();

      expect(installButton()).toBeDisabled();
    });

    it('installs the filter when Install filter is clicked', () => {
      buildHookMock({ filterFile, isInstallEnabled: true });
      renderPage();

      expect(installButton()).toBeEnabled();
      fireEvent.click(installButton()!);

      expect(handleInstall).toHaveBeenCalledTimes(1);
    });
  });

  describe('loader', () => {
    it('is hidden by default', () => {
      renderPage();

      expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();
    });

    it('is shown while the filter is being created', () => {
      buildHookMock({ filterFile, isCreating: true });
      renderPage();

      expect(screen.getByTestId('mock-loader')).toBeInTheDocument();
    });
  });
});
