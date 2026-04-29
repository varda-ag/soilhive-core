import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsGeneralInfoStep } from '../../../src/pages/AdminPortal/DatasetsGeneralInfoStep/DatasetsGeneralInfoStep';
import { useGeneralInfoForm } from 'hooks/useGeneralInfoForm';
import { ADMIN_PATHS } from '../../../src/configuration/admin';

jest.mock('hooks/useGeneralInfoForm', () => ({
  useGeneralInfoForm: jest.fn(),
}));

jest.mock('react-router', () => ({
  useParams: () => ({ id: undefined }),
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('assets/icons/info-square-icon.svg?react', () => {
  const Mock = () => <div data-testid="info-square-icon" />;
  Mock.displayName = 'Mock';
  return Mock;
});

const baseForm = {
  formData: { name: '', full_name: '', description: '', author: '' },
  errors: {},
  submitError: null,
  isLoading: false,
  isSaving: false,
  descriptionMaxLength: 200,
  handleChange: jest.fn(),
  handleSaveAndContinueLater: jest.fn(),
  handleContinue: jest.fn(),
};

describe('DatasetsGeneralInfoStep', () => {
  beforeEach(() => {
    (useGeneralInfoForm as jest.Mock).mockReturnValue(baseForm);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls handleContinue when Continue is clicked', () => {
    render(<DatasetsGeneralInfoStep />);
    fireEvent.click(screen.getByTestId('sh-general-info-continue'));
    expect(baseForm.handleContinue).toHaveBeenCalledTimes(1);
  });

  it('calls handleSaveAndContinueLater when that button is clicked', () => {
    render(<DatasetsGeneralInfoStep />);
    fireEvent.click(screen.getByTestId('sh-general-info-save-later'));
    expect(baseForm.handleSaveAndContinueLater).toHaveBeenCalledTimes(1);
  });

  it('renders Cancel button linking to datasets list', () => {
    render(<DatasetsGeneralInfoStep />);
    const cancelButton = screen.getByTestId('sh-general-info-cancel');
    expect(cancelButton).toBeInTheDocument();
    expect(cancelButton).toHaveAttribute('href', ADMIN_PATHS.DATASETS);
  });

  it('disables buttons while saving', () => {
    (useGeneralInfoForm as jest.Mock).mockReturnValue({ ...baseForm, isSaving: true });
    render(<DatasetsGeneralInfoStep />);
    expect(screen.getByTestId('sh-general-info-continue')).toBeDisabled();
    expect(screen.getByTestId('sh-general-info-save-later')).toBeDisabled();
  });

  it('renders matches snapshot', () => {
    const { container } = render(<DatasetsGeneralInfoStep />);
    expect(container).toMatchSnapshot();
  });
});
