import { render, screen, fireEvent } from '@testing-library/react';
import { LicenseRow } from 'components/Metadata/LicenseRow/LicenseRow';
import useNotifications from 'hooks/useNotifications';
import { useCreateLicenseMutation } from 'hooks/useDatasetMutation';

jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useDatasetMutation', () => ({
  useCreateLicenseMutation: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: jest.fn().mockReturnValue({ invalidateQueries: jest.fn() }),
}));

jest.mock('components/UI', () => ({
  Button: ({ children, onClick, isDisabled }: any) => (
    <button onClick={onClick} disabled={!!isDisabled}>
      {children}
    </button>
  ),
  Dropdown: ({ options, value, onChange, placeholder, isDisabled, isError }: any) => (
    <select
      data-testid="sh-ui-dropdown"
      data-invalid={isError ? 'true' : undefined}
      value={value ?? ''}
      disabled={!!isDisabled}
      onChange={(e: any) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o: any) => (
        <option key={o.code} value={o.code}>
          {o.name}
        </option>
      ))}
    </select>
  ),
  TextInput: ({ label, value, onChange, placeholder, isDisabled, isRequired }: any) => (
    <input
      aria-label={label}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e: any) => onChange(e.target.value)}
      disabled={!!isDisabled}
      required={!!isRequired}
    />
  ),
}));

const mockShowNotification = jest.fn();
const mockMutate = jest.fn();
const mockOnChange = jest.fn();

const licenses = [
  { id: 'lic-1', name: 'MIT', full_name: 'MIT License', url: 'https://mit.example', created_at: new Date(), updated_at: null },
  { id: 'lic-2', name: 'Apache', full_name: undefined, url: undefined, created_at: new Date(), updated_at: null },
];

const defaultProps = {
  label: 'License',
  currentLicenseIds: [] as string[],
  allLicenses: licenses,
  isEditable: false,
  property: 'licenses',
  onChange: mockOnChange,
};

describe('LicenseRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNotifications as jest.Mock).mockReturnValue({ showNotification: mockShowNotification });
    (useCreateLicenseMutation as jest.Mock).mockReturnValue({ mutate: mockMutate });
  });

  describe('view mode (isEditable=false)', () => {
    it('renders the label', () => {
      render(<LicenseRow {...defaultProps} />);
      expect(screen.getByText('License')).toBeInTheDocument();
    });

    it('renders an asterisk when isRequired', () => {
      const { container } = render(<LicenseRow {...defaultProps} isRequired />);
      const label = container.querySelector('p > strong');
      expect(label?.textContent).toBe('License*');
      expect(label?.querySelector('sup')).toHaveTextContent('*');
    });

    it('does not render an asterisk when isRequired is not set', () => {
      const { container } = render(<LicenseRow {...defaultProps} />);
      expect(container.querySelector('p > strong sup')).not.toBeInTheDocument();
    });

    it('renders license full_name when present', () => {
      render(<LicenseRow {...defaultProps} currentLicenseIds={['lic-1']} />);
      expect(screen.getByText('MIT License')).toBeInTheDocument();
    });

    it('renders license name when full_name is absent', () => {
      render(<LicenseRow {...defaultProps} currentLicenseIds={['lic-2']} />);
      expect(screen.getByText('Apache')).toBeInTheDocument();
    });

    it('renders license as a link when url is present', () => {
      render(<LicenseRow {...defaultProps} currentLicenseIds={['lic-1']} />);
      expect(screen.getByRole('link', { name: 'MIT License' })).toBeInTheDocument();
    });

    it('renders no content when currentLicenseIds is empty', () => {
      render(<LicenseRow {...defaultProps} currentLicenseIds={[]} />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByText('MIT License')).not.toBeInTheDocument();
    });

    it('does not render the dropdown in view mode', () => {
      render(<LicenseRow {...defaultProps} />);
      expect(screen.queryByTestId('sh-ui-dropdown')).not.toBeInTheDocument();
    });
  });

  describe('edit mode – dropdown', () => {
    it('renders dropdown with all license options plus Custom license', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      expect(screen.getByTestId('sh-ui-dropdown')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'MIT License' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Apache' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Custom license' })).toBeInTheDocument();
    });

    it('initializes dropdown value from currentLicenseIds[0]', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} currentLicenseIds={['lic-2']} />);
      expect(screen.getByTestId('sh-ui-dropdown')).toHaveValue('lic-2');
    });

    it('syncs dropdown value when currentLicenseIds loads asynchronously', () => {
      const { rerender } = render(<LicenseRow {...defaultProps} isEditable={true} currentLicenseIds={[]} />);
      expect(screen.getByTestId('sh-ui-dropdown')).toHaveValue('');

      rerender(<LicenseRow {...defaultProps} isEditable={true} currentLicenseIds={['lic-1']} />);
      expect(screen.getByTestId('sh-ui-dropdown')).toHaveValue('lic-1');
    });

    it('does not override a user selection when currentLicenseIds later updates', () => {
      const { rerender } = render(<LicenseRow {...defaultProps} isEditable={true} currentLicenseIds={[]} />);
      fireEvent.change(screen.getByTestId('sh-ui-dropdown'), { target: { value: 'lic-2' } });

      rerender(<LicenseRow {...defaultProps} isEditable={true} currentLicenseIds={['lic-1']} />);
      expect(screen.getByTestId('sh-ui-dropdown')).toHaveValue('lic-2');
    });

    it('calls onChange immediately when an existing license is selected', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      fireEvent.change(screen.getByTestId('sh-ui-dropdown'), { target: { value: 'lic-1' } });
      expect(mockOnChange).toHaveBeenCalledWith('licenses', 'lic-1');
    });

    it('does not call onChange when Custom license option is selected', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      fireEvent.change(screen.getByTestId('sh-ui-dropdown'), { target: { value: '__new_license__' } });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('sets data-invalid on dropdown when hasError is true', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} hasError={true} />);
      expect(screen.getByTestId('sh-ui-dropdown')).toHaveAttribute('data-invalid', 'true');
    });

    it('does not set data-invalid when hasError is false', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} hasError={false} />);
      expect(screen.getByTestId('sh-ui-dropdown')).not.toHaveAttribute('data-invalid');
    });
  });

  describe('custom license form', () => {
    const selectCustomLicense = () => {
      fireEvent.change(screen.getByTestId('sh-ui-dropdown'), { target: { value: '__new_license__' } });
    };

    it('shows Name, Full name, and URL inputs after selecting Custom license', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      selectCustomLicense();

      expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Full name' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'URL' })).toBeInTheDocument();
    });

    it('Create button is disabled when Name is empty', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      selectCustomLicense();
      expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    });

    it('Create button is enabled when Name has content', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      selectCustomLicense();
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'CC-BY-4.0' } });
      expect(screen.getByRole('button', { name: 'Create' })).not.toBeDisabled();
    });

    it('calls createLicense.mutate with trimmed name, full_name, and url', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      selectCustomLicense();

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: ' CC-BY-4.0 ' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), { target: { value: 'Creative Commons 4.0' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
        target: { value: 'https://creativecommons.org/licenses/by/4.0/' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { name: 'CC-BY-4.0', full_name: 'Creative Commons 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('omits full_name and url when they are empty', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      selectCustomLicense();

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'CC-BY-4.0' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { name: 'CC-BY-4.0', full_name: undefined, url: undefined },
        expect.any(Object),
      );
    });

    it('on success calls onChange with new license id and hides the form', () => {
      const newLicense = { id: 'new-lic', name: 'CC-BY-4.0' };
      (useCreateLicenseMutation as jest.Mock).mockReturnValue({
        mutate: jest.fn((_data: any, { onSuccess }: any) => onSuccess(newLicense)),
      });

      render(<LicenseRow {...defaultProps} isEditable={true} />);
      selectCustomLicense();

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'CC-BY-4.0' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(mockOnChange).toHaveBeenCalledWith('licenses', 'new-lic');
      expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    });

    it('on error shows "Failed to create license" notification', () => {
      const error = new Error('Network error');
      (useCreateLicenseMutation as jest.Mock).mockReturnValue({
        mutate: jest.fn((_data: any, { onError }: any) => onError(error)),
      });

      render(<LicenseRow {...defaultProps} isEditable={true} />);
      selectCustomLicense();

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'CC-BY-4.0' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Failed to create license', type: 'error', message: 'Network error' }),
      );
    });
  });
});
