import { render, screen, fireEvent } from '@testing-library/react';
import { DownloadsMenuItem } from 'components/DownloadsStatus/DownloadsMenu/DownloadsMenuItem/DownloadsMenuItem';

jest.mock('primereact/confirmpopup', () => ({
  ConfirmPopup: (props: any) => {
    return (
      <div data-testid="confirm-popup" data-visible={String(!!props.visible)}>
        <div data-testid="confirm-message">{props.message}</div>
        <button type="button" data-testid="confirm-accept" onClick={() => props.accept?.()}>
          accept
        </button>
        <button type="button" data-testid="confirm-hide" onClick={() => props.onHide?.()}>
          hide
        </button>
      </div>
    );
  },
}));

describe('DownloadsMenuItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders component with provided progress', () => {
    const { container } = render(<DownloadsMenuItem progress={42} onCancel={jest.fn()} />);

    expect(screen.getByTestId('sh-downloads-menu-item')).toBeInTheDocument();
    expect(screen.getByText('42 %')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('opens ConfirmPopup when Cancel button is clicked', () => {
    render(<DownloadsMenuItem progress={10} onCancel={jest.fn()} />);

    expect(screen.getByTestId('confirm-popup')).toHaveAttribute('data-visible', 'false');

    fireEvent.click(screen.getByTestId('sh-downloads-menu-item-cancel'));

    expect(screen.getByTestId('confirm-popup')).toHaveAttribute('data-visible', 'true');
  });

  it('hides ConfirmPopup when onHide is called', () => {
    render(<DownloadsMenuItem progress={10} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByTestId('sh-downloads-menu-item-cancel'));
    expect(screen.getByTestId('confirm-popup')).toHaveAttribute('data-visible', 'true');

    fireEvent.click(screen.getByTestId('confirm-hide'));
    expect(screen.getByTestId('confirm-popup')).toHaveAttribute('data-visible', 'false');
  });

  it('calls onCancel when accept is clicked', () => {
    const onCancel = jest.fn();
    render(<DownloadsMenuItem progress={10} onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId('sh-downloads-menu-item-cancel'));
    fireEvent.click(screen.getByTestId('confirm-accept'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
