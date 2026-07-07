import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from 'components/UI/Dialog/Dialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('assets/icons/cross-icon.svg?react', () => {
  const CloseIconMock = () => <div data-testid="close-icon" />;
  CloseIconMock.displayName = 'CloseIconMock';
  return CloseIconMock;
});

describe('Dialog', () => {
  const defaultProps = {
    visible: true,
    header: 'Test header',
    onPrimary: jest.fn(),
    onSecondary: jest.fn(),
  };

  it('renders header, children and continue button when visible', () => {
    render(
      <Dialog {...defaultProps}>
        <p>Test content</p>
      </Dialog>,
    );

    expect(screen.getByText('Test header')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
    expect(screen.getByText('dialog.continue')).toBeInTheDocument();
  });

  it('calls onSecondary when close button is clicked', () => {
    const onSecondary = jest.fn();
    render(
      <Dialog {...defaultProps} onSecondary={onSecondary}>
        <p>content</p>
      </Dialog>,
    );

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked and onClose is provided', () => {
    const onClose = jest.fn();
    const onSecondary = jest.fn();
    render(
      <Dialog {...defaultProps} onSecondary={onSecondary} onClose={onClose}>
        <p>content</p>
      </Dialog>,
    );

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSecondary).not.toHaveBeenCalled();
  });

  it('calls onSecondary when secondary button is clicked', () => {
    const onSecondary = jest.fn();
    render(
      <Dialog {...defaultProps} onSecondary={onSecondary} secondaryText="Cancel">
        <p>content</p>
      </Dialog>,
    );

    fireEvent.click(screen.getAllByTestId('sh-ui-button')[0]);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('calls onPrimary when primary button is clicked', () => {
    const onPrimary = jest.fn();
    render(
      <Dialog {...defaultProps} onPrimary={onPrimary} secondaryText="Cancel">
        <p>content</p>
      </Dialog>,
    );

    fireEvent.click(screen.getAllByTestId('sh-ui-button')[1]);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('does not render content when visible is false', () => {
    render(
      <Dialog {...defaultProps} visible={false}>
        <p>hidden content</p>
      </Dialog>,
    );

    expect(screen.queryByText('Test header')).not.toBeInTheDocument();
    expect(screen.queryByText('hidden content')).not.toBeInTheDocument();
  });

  describe('hideButtons', () => {
    it('hides the footer when hideButtons is true', () => {
      render(
        <Dialog {...defaultProps} hideButtons>
          <p>content</p>
        </Dialog>,
      );
      expect(screen.queryByText('dialog.continue')).not.toBeInTheDocument();
    });

    it('shows the footer by default', () => {
      render(
        <Dialog {...defaultProps}>
          <p>content</p>
        </Dialog>,
      );
      expect(screen.getByText('dialog.continue')).toBeInTheDocument();
    });

    it('shows the footer when hideButtons is false', () => {
      render(
        <Dialog {...defaultProps} hideButtons={false}>
          <p>content</p>
        </Dialog>,
      );
      expect(screen.getByText('dialog.continue')).toBeInTheDocument();
    });
  });

  it('applies custom className to the dialog', () => {
    render(
      <Dialog {...defaultProps} className="my-custom-class" removeTransition>
        <p>content</p>
      </Dialog>,
    );
    expect(document.querySelector('.my-custom-class')).toBeInTheDocument();
  });
});
