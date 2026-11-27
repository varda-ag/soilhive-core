import { render, screen, fireEvent } from '@testing-library/react';
import { AccessRequestStatusDialog } from 'components/AccessRequest/AccessRequestStatusDialog/AccessRequestStatusDialog';

jest.mock('components/Dialog/Dialog', () => ({
  Dialog: ({ header, primaryText, secondaryText, onPrimary, children }: any) => (
    <div data-testid="mock-dialog" data-header={header}>
      <div data-testid="dialog-content">{children}</div>
      {secondaryText && <button>{secondaryText}</button>}
      <button onClick={onPrimary}>{primaryText}</button>
    </div>
  ),
}));

describe('AccessRequestStatusDialog', () => {
  const onClose = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it('says the request was sent, with Close as its only button', () => {
    render(<AccessRequestStatusDialog status="sent" datasetName="Soil Carbon Kenya" onClose={onClose} />);

    expect(screen.getByTestId('mock-dialog')).toHaveAttribute('data-header', 'Permission for privacy data');
    expect(screen.getByTestId('dialog-content')).toHaveTextContent('You can check your access request status in your profile page.');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says the dataset is asked for already', () => {
    render(<AccessRequestStatusDialog status="alreadyRequested" datasetName="Soil Carbon Kenya" onClose={onClose} />);

    expect(screen.getByTestId('mock-dialog')).toHaveAttribute('data-header', "You can't access this dataset");
    // The test double of Trans renders its key
    expect(screen.getByTestId('dialog-content')).toHaveTextContent('access_request.already_requested.text');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
