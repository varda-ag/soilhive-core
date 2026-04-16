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
    onContinue: jest.fn(),
    onCancel: jest.fn(),
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

  it('calls onCancel when close button is clicked', () => {
    const onCancel = jest.fn();
    render(
      <Dialog {...defaultProps} onCancel={onCancel}>
        <p>content</p>
      </Dialog>,
    );

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = jest.fn();
    render(
      <Dialog {...defaultProps} onCancel={onCancel} cancelText="Cancel">
        <p>content</p>
      </Dialog>,
    );

    fireEvent.click(screen.getAllByTestId('sh-ui-button')[0]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onContinue when continue button is clicked', () => {
    const onContinue = jest.fn();
    render(
      <Dialog {...defaultProps} onContinue={onContinue} cancelText="Cancel">
        <p>content</p>
      </Dialog>,
    );

    fireEvent.click(screen.getAllByTestId('sh-ui-button')[1]);
    expect(onContinue).toHaveBeenCalledTimes(1);
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

  it('applies custom className to the dialog', () => {
    render(
      <Dialog {...defaultProps} className="my-custom-class" removeTransition>
        <p>content</p>
      </Dialog>,
    );
    expect(document.querySelector('.my-custom-class')).toBeInTheDocument();
  });
});
