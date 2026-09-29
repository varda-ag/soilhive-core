import { render, screen, fireEvent } from '@testing-library/react';
import useTheme from 'hooks/useTheme';
import { ExportSettings } from '../../../src/pages/AdminPortal/ExportSettings/ExportSettings';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const UNLIMITED = { maxAreaM2: null, maxObservations: null, maxRasterLayers: null, exemptAdmins: false };

// Rendered in order: area, observations, raster layers, exempt administrators
const checkboxes = () => screen.getAllByRole('checkbox');
const inputs = () => screen.getAllByTestId('sh-ui-textinputfield') as HTMLInputElement[];
const saveButton = () => screen.getByText('Save changes').closest('button') as HTMLButtonElement;

describe('ExportSettings page', () => {
  let saveExportLimits: jest.Mock;

  const renderPage = (exportLimits: object | undefined = UNLIMITED) => {
    (useTheme as jest.Mock).mockReturnValue({ themeConfig: { exportLimits }, saveExportLimits });
    return render(<ExportSettings />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    saveExportLimits = jest.fn();
  });

  it('renders the title, explanation and every limit', () => {
    renderPage();
    expect(screen.getByText('Export limits')).toBeInTheDocument();
    expect(screen.getByText('Area limit (km²)')).toBeInTheDocument();
    expect(screen.getByText('Observations limit')).toBeInTheDocument();
    expect(screen.getByText('Raster layers limit')).toBeInTheDocument();
    expect(screen.getByText('Exempt administrators')).toBeInTheDocument();
  });

  it('starts unlimited, with inputs and the exemption disabled', () => {
    renderPage();
    checkboxes().forEach(checkbox => expect(checkbox).not.toBeChecked());
    inputs().forEach(input => expect(input).toBeDisabled());
    expect(checkboxes()[3]).toBeDisabled();
  });

  it('starts unlimited when the theme has no export limits', () => {
    renderPage(undefined);
    checkboxes().forEach(checkbox => expect(checkbox).not.toBeChecked());
  });

  it('initialises from the stored limits, showing the area in km²', () => {
    renderPage({ maxAreaM2: 1_500_000_000, maxObservations: 500_000, maxRasterLayers: null, exemptAdmins: true });
    expect(checkboxes()[0]).toBeChecked();
    expect(checkboxes()[1]).toBeChecked();
    expect(checkboxes()[2]).not.toBeChecked();
    expect(checkboxes()[3]).toBeChecked();
    expect(inputs()[0]).toHaveValue(1500);
    expect(inputs()[1]).toHaveValue(500000);
  });

  it('saves unlimited when no limit is enabled', () => {
    renderPage();
    fireEvent.click(saveButton());
    expect(saveExportLimits).toHaveBeenCalledWith(UNLIMITED);
  });

  it('saves the area in m²', () => {
    renderPage();
    fireEvent.click(checkboxes()[0]);
    fireEvent.change(inputs()[0], { target: { value: '1000.5' } });
    fireEvent.click(saveButton());
    expect(saveExportLimits).toHaveBeenCalledWith({ ...UNLIMITED, maxAreaM2: 1_000_500_000 });
  });

  it('saves the limits independently of each other', () => {
    renderPage();
    fireEvent.click(checkboxes()[1]);
    fireEvent.change(inputs()[1], { target: { value: '500000' } });
    fireEvent.click(checkboxes()[2]);
    fireEvent.change(inputs()[2], { target: { value: '10' } });
    fireEvent.click(checkboxes()[3]);
    fireEvent.click(saveButton());
    expect(saveExportLimits).toHaveBeenCalledWith({ maxAreaM2: null, maxObservations: 500000, maxRasterLayers: 10, exemptAdmins: true });
  });

  it('saves an unticked limit as null', () => {
    renderPage({ ...UNLIMITED, maxRasterLayers: 10 });
    fireEvent.click(checkboxes()[2]);
    fireEvent.click(saveButton());
    expect(saveExportLimits).toHaveBeenCalledWith(UNLIMITED);
  });

  it('never saves the exemption without a limit', () => {
    renderPage({ ...UNLIMITED, maxRasterLayers: 10, exemptAdmins: true });
    fireEvent.click(checkboxes()[2]);
    expect(checkboxes()[3]).toBeDisabled();
    fireEvent.click(saveButton());
    expect(saveExportLimits).toHaveBeenCalledWith(UNLIMITED);
  });

  it('blocks saving an enabled limit left empty', () => {
    renderPage();
    fireEvent.click(checkboxes()[0]);
    expect(screen.getByText('Enter a number greater than zero')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it.each(['0', '-3', '1.5'])('rejects %s as a count', value => {
    renderPage();
    fireEvent.click(checkboxes()[1]);
    fireEvent.change(inputs()[1], { target: { value } });
    expect(screen.getByText('Enter a whole number greater than zero')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('rejects an area that would be stored as 0 m²', () => {
    renderPage();
    fireEvent.click(checkboxes()[0]);
    fireEvent.change(inputs()[0], { target: { value: '0.0000001' } });
    expect(screen.getByText('Enter a number greater than zero')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('accepts a decimal area', () => {
    renderPage();
    fireEvent.click(checkboxes()[0]);
    fireEvent.change(inputs()[0], { target: { value: '0.5' } });
    expect(saveButton()).toBeEnabled();
  });
});
