import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  isWebsiteAddress,
  RequestAccessDialog,
  REQUEST_FIELD_MAX_LENGTHS,
  REQUEST_REASON_MAX_LENGTH,
} from 'components/AccessRequest/RequestAccessDialog/RequestAccessDialog';
import useTheme from 'hooks/useTheme';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('../../__mocks__/react-i18next'),
  // Shows the key and the link it was given
  Trans: ({ i18nKey, components }: { i18nKey: string; components: { a?: React.ReactElement } }) => (
    <span data-testid={`trans-${i18nKey}`}>
      {i18nKey}
      {components.a}
    </span>
  ),
}));

jest.mock('components/Dialog/Dialog', () => ({
  Dialog: ({ header, isLoading, isPrimaryDisabled, primaryText, secondaryText, onPrimary, onSecondary, children }: any) => (
    <div data-testid="mock-dialog" data-header={header} data-loading={isLoading}>
      {children}
      <button onClick={onSecondary}>{secondaryText}</button>
      <button disabled={isLoading || isPrimaryDisabled} onClick={onPrimary}>
        {primaryText}
      </button>
    </div>
  ),
}));

const PROFILE = { name: 'Jane Doe', email: 'jane@example.org' };

const renderDialog = (props: { isLoading?: boolean; isSubmitting?: boolean } = {}) => {
  const handlers = { onClose: jest.fn(), onSubmit: jest.fn() };
  render(<RequestAccessDialog datasetName="Soil Carbon Kenya" {...props} {...handlers} />);
  return handlers;
};

// The label wraps its field (FormFieldWrapper), so a field is found by its label text
const fieldOf = (label: string) => within(screen.getByText(label).closest('label')!).getByRole('textbox') as HTMLInputElement;
const fill = (label: string, value: string) => fireEvent.change(fieldOf(label), { target: { value } });

// The country is a searchable Dropdown: Enter picks the first country the typed text shows
const countryField = () => within(screen.getByText('Country').closest('label')!).getByRole('combobox') as HTMLInputElement;
const pickCountry = (typed: string) => {
  fireEvent.focus(countryField());
  fireEvent.change(countryField(), { target: { value: typed } });
  fireEvent.keyDown(countryField(), { key: 'Enter' });
  fireEvent.blur(countryField());
};

const fillRequired = () => {
  pickCountry('Kenya');
  fill('Organisation', 'Varda');
  fill('Reason for your request', 'A soil carbon study');
};

const submitButton = () => screen.getByRole('button', { name: 'Request access' });

describe('RequestAccessDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthContext as jest.Mock).mockReturnValue({ user: { profile: PROFILE } });
    (useTheme as jest.Mock).mockReturnValue({ themeConfig: { privacyPolicyHtml: '<p>Policy</p>' } });
  });

  it('names the dataset asked for, and starts with the name and the email of the signed-in user, which can not be changed', () => {
    renderDialog();

    expect(screen.getByTestId('mock-dialog')).toHaveAttribute('data-header', 'Request access');
    expect(screen.getByTestId('trans-access_request.form.dataset')).toBeInTheDocument();
    expect(fieldOf('Name')).toHaveValue('Jane Doe');
    expect(fieldOf('Name')).toBeDisabled();
    expect(fieldOf('Email')).toHaveValue('jane@example.org');
    expect(fieldOf('Email')).toBeDisabled();
    ['Organisation', 'Organisation website', 'Reason for your request'].forEach(label => expect(fieldOf(label)).toHaveValue(''));
    expect(countryField()).toHaveValue('');
  });

  it('can only be sent once every required field is filled, and sends what was typed', () => {
    const { onSubmit } = renderDialog();
    expect(submitButton()).toBeDisabled();

    fillRequired();
    expect(submitButton()).toBeEnabled();
    fireEvent.click(submitButton());

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.org',
      country: 'KE',
      organisation: 'Varda',
      organisationWebsite: '',
      reason: 'A soil carbon study',
    });
  });

  it.each([
    ['turk', 'TR'],
    ["cote d'ivoire", 'CI'],
    ['sao tome', 'ST'],
  ])('finds a country typed without its accents: %p', (typed, code) => {
    const { onSubmit } = renderDialog();
    pickCountry(typed);
    fill('Organisation', 'Varda');
    fill('Reason for your request', 'A soil carbon study');

    fireEvent.click(submitButton());

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ country: code }));
  });

  it('takes no blank answer', () => {
    renderDialog();
    fillRequired();

    fill('Organisation', '   ');

    expect(submitButton()).toBeDisabled();
  });

  it('lets a user whose profile has no name type it', () => {
    (useAuthContext as jest.Mock).mockReturnValue({ user: { profile: { email: PROFILE.email } } });
    renderDialog();
    fillRequired();
    expect(fieldOf('Name')).toBeEnabled();
    expect(submitButton()).toBeDisabled();

    fill('Name', 'Jane');

    expect(submitButton()).toBeEnabled();
  });

  it('opens a name from the profile too long to send, and says why it blocks sending', () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: { profile: { ...PROFILE, name: 'J'.repeat(REQUEST_FIELD_MAX_LENGTHS.name + 1) } },
    });
    renderDialog();
    fillRequired();

    expect(fieldOf('Name')).toBeEnabled();
    expect(screen.getByText('Use up to {{max}} characters')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it('refuses a website the backend would refuse, but sends without one', () => {
    renderDialog();
    fillRequired();

    fill('Organisation website', 'not a url');
    expect(screen.getByText('Enter a website address, e.g. example.org')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    fill('Organisation website', 'example.org');
    expect(submitButton()).toBeEnabled();
  });

  it('limits the reason as the design does', () => {
    renderDialog();

    expect(fieldOf('Reason for your request')).toHaveAttribute('maxLength', `${REQUEST_REASON_MAX_LENGTH}`);
  });

  it('can not be sent while loading or sending', () => {
    renderDialog({ isLoading: true });
    fillRequired();
    expect(submitButton()).toBeDisabled();
  });

  it('says why the backend refused the last request, in the form', () => {
    const handlers = { onClose: jest.fn(), onSubmit: jest.fn() };
    const { rerender } = render(<RequestAccessDialog datasetName="Soil Carbon Kenya" {...handlers} />);
    expect(screen.queryByTestId('sh-form-message')).not.toBeInTheDocument();

    rerender(
      <RequestAccessDialog datasetName="Soil Carbon Kenya" sendError="Couldn't send the request. Please try again." {...handlers} />,
    );

    expect(screen.getByTestId('sh-form-message')).toHaveTextContent("Couldn't send the request. Please try again.");
  });

  it('closes on Cancel', () => {
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('links the privacy policy in a new tab, only when there is one', () => {
    renderDialog();

    const link = within(screen.getByTestId('trans-access_request.form.privacy')).getByRole('link');
    expect(link).toHaveAttribute('href', '/privacy-policy');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('leaves the privacy note out without a privacy policy', () => {
    (useTheme as jest.Mock).mockReturnValue({ themeConfig: {} });
    renderDialog();

    expect(screen.queryByTestId('trans-access_request.form.privacy')).not.toBeInTheDocument();
  });
});

describe('isWebsiteAddress', () => {
  it.each([
    ['', true],
    ['example.org', true],
    ['https://example.org/path', true],
    ['http://example.org', true],
    ['localhost', false],
    ['not a url', false],
    ['ftp://example.org', false],
  ])('%p → %p', (value, expected) => {
    expect(isWebsiteAddress(value)).toBe(expected);
  });
});
