import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsSettingsPage } from '../../../src/pages/AdminPortal/DatasetsSettingsPage/DatasetsSettingsPage';
import { useDatasetsSettings } from 'hooks/useDatasetsSettings';

jest.mock('hooks/useDatasetsSettings', () => ({
  useDatasetsSettings: jest.fn(),
}));

jest.mock('react-router', () => ({
  useParams: () => ({ id: 'dataset-123' }),
}));

jest.mock('components/UI', () => ({
  Button: ({ children, onClick, type, isIconOnly }: any) => (
    <button data-testid={isIconOnly ? 'sh-ui-icon-button' : `sh-ui-button-${type ?? 'primary'}`} onClick={onClick}>
      {children}
    </button>
  ),
  TextInput: ({ value, onChange, onBlur, errorMessage }: any) => (
    <>
      <input data-testid="sh-ui-text-input" value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
      {errorMessage && <span data-testid="sh-ui-text-input-error">{errorMessage}</span>}
    </>
  ),
  Table: ({ value, columns }: any) => (
    <div data-testid="sh-ui-table">
      {value.map((row: any) => (
        <div key={row.email} data-testid="sh-ui-table-row">
          {columns.map((col: any, i: number) => (
            <span key={i}>{col.bodyTemplate ? col.bodyTemplate(row) : row[col.value]}</span>
          ))}
        </div>
      ))}
    </div>
  ),
  Dialog: ({ visible, onPrimary, onSecondary, children }: any) =>
    visible ? (
      <div data-testid="sh-ui-dialog">
        {children}
        <button data-testid="sh-ui-dialog-cancel" onClick={onSecondary} />
        <button data-testid="sh-ui-dialog-confirm" onClick={onPrimary} />
      </div>
    ) : null,
}));

const setVisibility = jest.fn();
const handleEmailChange = jest.fn();
const handleEmailBlur = jest.fn();
const handleAddEmail = jest.fn();
const handleRequestRemoveEmail = jest.fn();
const handleConfirmRemoveEmail = jest.fn();
const handleCancelRemoveEmail = jest.fn();
const handlePublish = jest.fn();
const handlePublishProceed = jest.fn();
const handlePublishCancel = jest.fn();
const handleCancel = jest.fn();

const baseHookValue = {
  visibility: 'public' as const,
  setVisibility,
  emailInput: '',
  emailError: '',
  accessEmails: [],
  emailToDelete: null,
  isPublishWarningVisible: false,
  handleEmailChange,
  handleEmailBlur,
  handleAddEmail,
  handleRequestRemoveEmail,
  handleConfirmRemoveEmail,
  handleCancelRemoveEmail,
  handlePublish,
  handlePublishProceed,
  handlePublishCancel,
  handleCancel,
};

describe('DatasetsSettingsPage', () => {
  beforeEach(() => {
    (useDatasetsSettings as jest.Mock).mockReturnValue(baseHookValue);
  });

  afterEach(() => jest.clearAllMocks());

  it('does not show the private access section when visibility is public', () => {
    render(<DatasetsSettingsPage />);
    expect(screen.queryByTestId('sh-ui-text-input')).not.toBeInTheDocument();
  });

  it('shows the private access section when visibility is private', () => {
    (useDatasetsSettings as jest.Mock).mockReturnValue({ ...baseHookValue, visibility: 'private' });
    render(<DatasetsSettingsPage />);
    expect(screen.getByTestId('sh-ui-text-input')).toBeInTheDocument();
  });

  it('clicking the private radio card calls setVisibility with private', () => {
    render(<DatasetsSettingsPage />);
    const [, privateCard] = screen.getAllByRole('radio');
    fireEvent.click(privateCard);
    expect(setVisibility).toHaveBeenCalledWith('private');
  });

  it('clicking the public radio card calls setVisibility with public', () => {
    (useDatasetsSettings as jest.Mock).mockReturnValue({ ...baseHookValue, visibility: 'private' });
    render(<DatasetsSettingsPage />);
    const [publicCard] = screen.getAllByRole('radio');
    fireEvent.click(publicCard);
    expect(setVisibility).toHaveBeenCalledWith('public');
  });

  it('submitting the email form calls handleAddEmail', () => {
    (useDatasetsSettings as jest.Mock).mockReturnValue({ ...baseHookValue, visibility: 'private' });
    const { container } = render(<DatasetsSettingsPage />);
    fireEvent.submit(container.querySelector('form')!);
    expect(handleAddEmail).toHaveBeenCalledTimes(1);
  });

  it('trash button in the table calls handleRequestRemoveEmail with the row email', () => {
    (useDatasetsSettings as jest.Mock).mockReturnValue({
      ...baseHookValue,
      visibility: 'private',
      accessEmails: [{ email: 'user@example.com' }],
    });
    render(<DatasetsSettingsPage />);
    fireEvent.click(screen.getByTestId('sh-ui-icon-button'));
    expect(handleRequestRemoveEmail).toHaveBeenCalledWith('user@example.com');
  });

  it('does not show the remove dialog when emailToDelete is null', () => {
    render(<DatasetsSettingsPage />);
    expect(screen.queryByTestId('sh-ui-dialog')).not.toBeInTheDocument();
  });

  it('shows the remove dialog when emailToDelete is set', () => {
    (useDatasetsSettings as jest.Mock).mockReturnValue({ ...baseHookValue, emailToDelete: 'user@example.com' });
    render(<DatasetsSettingsPage />);
    expect(screen.getByTestId('sh-ui-dialog')).toBeInTheDocument();
  });

  it('confirm button in the dialog calls handleConfirmRemoveEmail', () => {
    (useDatasetsSettings as jest.Mock).mockReturnValue({ ...baseHookValue, emailToDelete: 'user@example.com' });
    render(<DatasetsSettingsPage />);
    fireEvent.click(screen.getByTestId('sh-ui-dialog-confirm'));
    expect(handleConfirmRemoveEmail).toHaveBeenCalledTimes(1);
  });

  it('cancel button in the dialog calls handleCancelRemoveEmail', () => {
    (useDatasetsSettings as jest.Mock).mockReturnValue({ ...baseHookValue, emailToDelete: 'user@example.com' });
    render(<DatasetsSettingsPage />);
    fireEvent.click(screen.getByTestId('sh-ui-dialog-cancel'));
    expect(handleCancelRemoveEmail).toHaveBeenCalledTimes(1);
  });

  it('page cancel button calls handleCancel', () => {
    render(<DatasetsSettingsPage />);
    fireEvent.click(screen.getByTestId('sh-ui-button-secondary'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('publish button calls handlePublish', () => {
    render(<DatasetsSettingsPage />);
    fireEvent.click(screen.getByTestId('sh-ui-button-primary'));
    expect(handlePublish).toHaveBeenCalledTimes(1);
  });

  it('does not show the publish warning dialog by default', () => {
    render(<DatasetsSettingsPage />);
    expect(screen.queryByTestId('sh-ui-dialog')).not.toBeInTheDocument();
  });

  it('shows the publish warning dialog when isPublishWarningVisible is true', () => {
    (useDatasetsSettings as jest.Mock).mockReturnValue({ ...baseHookValue, isPublishWarningVisible: true });
    render(<DatasetsSettingsPage />);
    expect(screen.getByTestId('sh-ui-dialog')).toBeInTheDocument();
  });

  it('confirm button in the publish warning dialog calls handlePublishCancel', () => {
    (useDatasetsSettings as jest.Mock).mockReturnValue({ ...baseHookValue, isPublishWarningVisible: true });
    render(<DatasetsSettingsPage />);
    fireEvent.click(screen.getByTestId('sh-ui-dialog-confirm'));
    expect(handlePublishCancel).toHaveBeenCalledTimes(1);
  });

  it('cancel button in the publish warning dialog calls handlePublishProceed', () => {
    (useDatasetsSettings as jest.Mock).mockReturnValue({ ...baseHookValue, isPublishWarningVisible: true });
    render(<DatasetsSettingsPage />);
    fireEvent.click(screen.getByTestId('sh-ui-dialog-cancel'));
    expect(handlePublishProceed).toHaveBeenCalledTimes(1);
  });
});
