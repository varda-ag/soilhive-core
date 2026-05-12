import { fireEvent, render, screen } from '@testing-library/react';
import { ColorsTab } from '../../../../src/pages/AdminPortal/LookAndFeel/tabs/ColorsTab/ColorsTab';
import useLookAndFeel from 'hooks/useLookAndFeel';

jest.mock('hooks/useLookAndFeel', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/AdminPortal/LookAndFeel/ColorsSettings/ColorsSettings', () => ({
  ColorsSettings: () => <div>ColorsSettings component</div>,
}));

jest.mock('components/AdminPortal/LookAndFeel/ColorsPreview/ColorsPreview', () => ({
  ColorsPreview: () => <div>ColorsPreview component</div>,
}));

jest.mock('components/UI', () => ({
  Button: ({ children, onClick, isDisabled, 'data-testid': testId }: any) => (
    <button data-testid={testId} onClick={onClick} disabled={isDisabled}>
      {children}
    </button>
  ),
}));

const mockHandleDefaultColorsSave = jest.fn();
const mockRestoreDefaultColors = jest.fn();

describe('ColorsTab page', () => {
  beforeEach(() => {
    (useLookAndFeel as jest.Mock).mockReturnValue({
      handleDefaultColorsSave: mockHandleDefaultColorsSave,
      restoreDefaultColors: mockRestoreDefaultColors,
      defaultColors: undefined,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('matches snapshot', () => {
    const { container } = render(<ColorsTab />);
    expect(container).toMatchSnapshot();
  });

  it('calls handleDefaultColorsSave when save default button is clicked', () => {
    render(<ColorsTab />);
    fireEvent.click(screen.getByTestId('save-default-button'));
    expect(mockHandleDefaultColorsSave).toHaveBeenCalledTimes(1);
  });

  it('calls restoreDefaultColors when restore default button is clicked', () => {
    (useLookAndFeel as jest.Mock).mockReturnValue({
      handleDefaultColorsSave: mockHandleDefaultColorsSave,
      restoreDefaultColors: mockRestoreDefaultColors,
      defaultColors: { primary: '#aaaaaa' },
    });

    render(<ColorsTab />);
    fireEvent.click(screen.getByTestId('restore-default-button'));

    expect(screen.getByTestId('restore-default-button')).not.toBeDisabled();
    expect(mockRestoreDefaultColors).toHaveBeenCalledTimes(1);
  });

  it('disables restore default button when defaultColors is undefined', () => {
    render(<ColorsTab />);
    expect(screen.getByTestId('restore-default-button')).toBeDisabled();
  });
});
