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

// Simplified UI mocks so we can drive Dropdown/TextInput without their real implementations
jest.mock('components/UI', () => ({
  Button: ({ children, onClick, isDisabled }: any) => (
    <button onClick={onClick} disabled={!!isDisabled}>
      {children}
    </button>
  ),
  Dropdown: ({ options, value, onChange, placeholder, isDisabled, errorMessage }: any) => (
    <>
      <select data-testid="sh-ui-dropdown" value={value ?? ''} disabled={!!isDisabled} onChange={(e: any) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o: any) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
      {errorMessage && <span data-testid="sh-ui-dropdown-error">{errorMessage}</span>}
    </>
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

const licenses = [
  { id: 'lic-1', name: 'MIT', full_name: 'MIT License', url: 'https://mit.example', created_at: new Date(), updated_at: null },
  { id: 'lic-2', name: 'Apache', full_name: undefined, url: undefined, created_at: new Date(), updated_at: null },
];

const defaultProps = {
  label: 'License',
  currentLicenseIds: [],
  allLicenses: licenses,
  isEditable: false,
  property: 'licenses',
  onStartEditing: jest.fn(),
  onSave: jest.fn(),
  onCancel: jest.fn(),
};

describe('LicenseRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNotifications as jest.Mock).mockReturnValue({ showNotification: mockShowNotification });
    (useCreateLicenseMutation as jest.Mock).mockReturnValue({ mutate: mockMutate });
  });

  describe('display mode', () => {
    it('renders the label', () => {
      render(<LicenseRow {...defaultProps} />);
      expect(screen.getByText('License')).toBeInTheDocument();
    });

    it('renders license full_name when present', () => {
      render(<LicenseRow {...defaultProps} currentLicenseIds={['lic-1']} />);
      expect(screen.getByText('MIT License')).toBeInTheDocument();
    });

    it('renders license name when full_name is null', () => {
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

    it('does not show edit button when isEditable=false', () => {
      render(<LicenseRow {...defaultProps} isEditable={false} />);
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('shows edit button when isEditable=true', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });
  });

  describe('entering edit mode', () => {
    it('clicking Edit calls onStartEditing and shows dropdown with license options', () => {
      const onStartEditing = jest.fn();
      render(<LicenseRow {...defaultProps} isEditable={true} onStartEditing={onStartEditing} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(onStartEditing).toHaveBeenCalledWith('licenses');
      expect(screen.getByTestId('sh-ui-dropdown')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'MIT License' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Apache' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Custom license' })).toBeInTheDocument();
    });
  });

  describe('save with existing license', () => {
    it('selecting a license and clicking Save calls onSave with licenseId', () => {
      const onSave = jest.fn();
      render(<LicenseRow {...defaultProps} isEditable={true} onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-dropdown'), { target: { value: 'lic-1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSave).toHaveBeenCalledWith(
        'licenses',
        'lic-1',
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('onSuccess exits editing mode', () => {
      const onSave = jest.fn((_property: string, _value: string, { onSuccess }: any) => onSuccess());
      render(<LicenseRow {...defaultProps} isEditable={true} onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-dropdown'), { target: { value: 'lic-2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('onError shows notification and stays in editing mode', () => {
      const error = new Error('Save failed');
      const onSave = jest.fn((_property: string, _value: string, { onError }: any) => onError(error));
      render(<LicenseRow {...defaultProps} isEditable={true} onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-dropdown'), { target: { value: 'lic-1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'Save failed' }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });
  });

  describe('cancel', () => {
    it('clicking Cancel calls onCancel and exits editing mode', () => {
      const onCancel = jest.fn();
      render(<LicenseRow {...defaultProps} isEditable={true} onCancel={onCancel} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onCancel).toHaveBeenCalledWith('licenses');
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    it('Cancel resets editValue to first currentLicenseId', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} currentLicenseIds={['lic-2']} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-dropdown'), { target: { value: 'lic-1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Re-enter editing to verify value was reset to original
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.getByTestId('sh-ui-dropdown')).toHaveValue('lic-2');
    });
  });

  describe('isRequired validation', () => {
    it('shows error and does not call onSave when no license is selected and Save is clicked', () => {
      const onSave = jest.fn();
      render(<LicenseRow {...defaultProps} isEditable={true} isRequired onSave={onSave} currentLicenseIds={[]} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.getByTestId('sh-ui-dropdown-error')).toHaveTextContent('This field is required');
      expect(onSave).not.toHaveBeenCalled();
    });

    it('clears error when user selects a license', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} isRequired currentLicenseIds={[]} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByTestId('sh-ui-dropdown-error')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('sh-ui-dropdown'), { target: { value: 'lic-1' } });
      expect(screen.queryByTestId('sh-ui-dropdown-error')).not.toBeInTheDocument();
    });
  });

  describe('custom license flow', () => {
    const enterCustomLicense = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-dropdown'), { target: { value: '__new_license__' } });
    };

    it('selecting "Custom license" shows Name, Full name, and URL inputs', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      enterCustomLicense();

      expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Full name' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'URL' })).toBeInTheDocument();
    });

    it('Save button is disabled when the name field is empty', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      enterCustomLicense();

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('Save is enabled once a name is entered', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      enterCustomLicense();

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'CC-BY-4.0' } });

      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });

    it('clicking Save calls createLicense.mutate with trimmed name, full_name, and url', () => {
      render(<LicenseRow {...defaultProps} isEditable={true} />);
      enterCustomLicense();

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: ' CC-BY-4.0 ' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), { target: { value: 'Creative Commons 4.0' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
        target: { value: 'https://creativecommons.org/licenses/by/4.0/' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { name: 'CC-BY-4.0', full_name: 'Creative Commons 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('on createLicense success calls onSave with new license id then exits editing', () => {
      const newLicense = { id: 'new-lic', name: 'CC-BY-4.0' };
      (useCreateLicenseMutation as jest.Mock).mockReturnValue({
        mutate: jest.fn((_data: any, { onSuccess }: any) => onSuccess(newLicense)),
      });
      const onSave = jest.fn((_property: string, _value: string, { onSuccess }: any) => onSuccess());

      render(<LicenseRow {...defaultProps} isEditable={true} onSave={onSave} />);
      enterCustomLicense();

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'CC-BY-4.0' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSave).toHaveBeenCalledWith('licenses', 'new-lic', expect.any(Object));
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });

    it('on createLicense error shows "Failed to create license" notification', () => {
      const error = new Error('Network error');
      (useCreateLicenseMutation as jest.Mock).mockReturnValue({
        mutate: jest.fn((_data: any, { onError }: any) => onError(error)),
      });

      render(<LicenseRow {...defaultProps} isEditable={true} />);
      enterCustomLicense();

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'CC-BY-4.0' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Failed to create license', type: 'error' }));
    });

    it('on onSave error after create shows "Failed to save license" notification', () => {
      const newLicense = { id: 'new-lic', name: 'CC-BY-4.0' };
      (useCreateLicenseMutation as jest.Mock).mockReturnValue({
        mutate: jest.fn((_data: any, { onSuccess }: any) => onSuccess(newLicense)),
      });
      const saveError = new Error('DB error');
      const onSave = jest.fn((_property: string, _value: string, { onError }: any) => onError(saveError));

      render(<LicenseRow {...defaultProps} isEditable={true} onSave={onSave} />);
      enterCustomLicense();

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'CC-BY-4.0' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Failed to save license', type: 'error' }));
    });
  });
});
