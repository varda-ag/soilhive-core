import { act, fireEvent, render, screen } from '@testing-library/react';
import { DatasetAccessRequest } from 'components/AccessRequest/DatasetAccessRequest/DatasetAccessRequest';
import { useAccessRequestCreate } from 'hooks/useAccessRequestCreate';
import { useMyAccessRequests } from 'hooks/useMyAccessRequests';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));
jest.mock('hooks/useAccessRequestCreate', () => ({ useAccessRequestCreate: jest.fn() }));
jest.mock('hooks/useMyAccessRequests', () => ({ useMyAccessRequests: jest.fn() }));

jest.mock('components/DownloadSignInDialog/DownloadSignInDialog', () => ({
  DownloadSignInDialog: ({ message, onClose }: any) => (
    <div data-testid="sign-in-dialog" onClick={onClose}>
      {message}
    </div>
  ),
}));
jest.mock('components/AccessRequest/RequestAccessDialog/RequestAccessDialog', () => ({
  RequestAccessDialog: ({ datasetName, isLoading, isSubmitting, sendError, onSubmit }: any) => (
    <div data-testid="request-form" data-dataset={datasetName} data-loading={isLoading} data-submitting={isSubmitting}>
      {sendError && <p data-testid="send-error">{sendError}</p>}
      <button onClick={() => onSubmit(mockFormValues)}>send</button>
    </div>
  ),
}));
jest.mock('components/AccessRequest/AccessRequestStatusDialog/AccessRequestStatusDialog', () => ({
  AccessRequestStatusDialog: ({ status, datasetName }: any) => <div data-testid={`status-${status}`} data-dataset={datasetName} />,
}));

const FORM_VALUES = {
  name: 'Jane Doe',
  email: 'jane@example.org',
  country: 'KE',
  organisation: 'Varda',
  organisationWebsite: '',
  reason: 'A soil carbon study',
};
// What the form test double sends
let mockFormValues = FORM_VALUES;

const DATASET = { id: 'soil-carbon-kenya', name: 'Soil Carbon Kenya' };

const ownRequest = (slug: string, status: 'pending' | 'approved' | 'denied' | 'withdrawn') => ({
  id: `request-${slug}`,
  status: status === 'pending' ? 'pending' : 'finished',
  createdAt: '2026-11-20T10:00:00Z',
  items: [{ dataset: { slug, name: slug }, status }],
});

describe('DatasetAccessRequest', () => {
  const createAccessRequest = jest.fn();
  const onClose = jest.fn();

  const mockMyRequests = (data: unknown[] | undefined, isLoading = false) =>
    (useMyAccessRequests as jest.Mock).mockReturnValue({ data, isLoading, isError: false, refetch: jest.fn() });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFormValues = FORM_VALUES;
    (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated: true });
    (useAccessRequestCreate as jest.Mock).mockReturnValue({ mutateAsync: createAccessRequest, isPending: false, isError: false });
    mockMyRequests([]);
  });

  const send = async () => {
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'send' })));
  };

  it('asks a signed-out visitor to log in first, without reading any request', () => {
    (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated: false });
    render(<DatasetAccessRequest dataset={DATASET} onClose={onClose} />);

    expect(screen.getByTestId('sign-in-dialog')).toHaveTextContent('Please log in to request access to this dataset.');
    expect(screen.queryByTestId('request-form')).not.toBeInTheDocument();
    expect(useMyAccessRequests).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('sign-in-dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the form, loading, while the user's own requests are read", () => {
    mockMyRequests(undefined, true);
    render(<DatasetAccessRequest dataset={DATASET} onClose={onClose} />);

    expect(screen.getByTestId('request-form')).toHaveAttribute('data-loading', 'true');
  });

  it('shows the form for a dataset not in a pending request: another one pending, or this one decided', () => {
    mockMyRequests([ownRequest('another-dataset', 'pending'), ownRequest(DATASET.id, 'denied')]);
    render(<DatasetAccessRequest dataset={DATASET} onClose={onClose} />);

    expect(screen.getByTestId('request-form')).toHaveAttribute('data-dataset', 'Soil Carbon Kenya');
    expect(screen.getByTestId('request-form')).toHaveAttribute('data-loading', 'false');
  });

  it('says the dataset is asked for already when a pending request names it', () => {
    mockMyRequests([ownRequest(DATASET.id, 'pending')]);
    render(<DatasetAccessRequest dataset={DATASET} onClose={onClose} />);

    expect(screen.getByTestId('status-alreadyRequested')).toHaveAttribute('data-dataset', 'Soil Carbon Kenya');
    expect(screen.queryByTestId('request-form')).not.toBeInTheDocument();
  });

  it('asks for this one dataset, to explore and download, and says the request was sent', async () => {
    createAccessRequest.mockResolvedValue({ id: 'request-1', status: 'pending', createdAt: '2026-11-27T10:00:00Z' });
    render(<DatasetAccessRequest dataset={DATASET} onClose={onClose} />);

    await send();

    expect(createAccessRequest).toHaveBeenCalledWith({
      datasets: ['soil-carbon-kenya'],
      capabilities: ['preview', 'download'],
      message: 'A soil carbon study',
      requesterName: 'Jane Doe',
      country: 'KE',
      organisation: 'Varda',
    });
    expect(screen.getByTestId('status-sent')).toBeInTheDocument();
  });

  it('sends the organisation website when one is given', async () => {
    createAccessRequest.mockResolvedValue({ id: 'request-1', status: 'pending', createdAt: '2026-11-27T10:00:00Z' });
    mockFormValues = { ...FORM_VALUES, organisationWebsite: 'example.org' };
    render(<DatasetAccessRequest dataset={DATASET} onClose={onClose} />);

    await send();

    expect(createAccessRequest).toHaveBeenCalledWith(expect.objectContaining({ organisationWebsite: 'example.org' }));
  });

  it('says the dataset is asked for already when the backend refuses with a 409', async () => {
    createAccessRequest.mockRejectedValue({ status: 409, body: { pending_request_id: 'request-0' } });
    render(<DatasetAccessRequest dataset={DATASET} onClose={onClose} />);

    await send();

    expect(screen.getByTestId('status-alreadyRequested')).toBeInTheDocument();
  });

  it("says any other refusal in the form, in the backend's words, and keeps the form open", async () => {
    createAccessRequest.mockRejectedValue({ status: 400, body: { detail: "Dataset 'Soil Carbon Kenya' doesn't take Access Requests" } });
    render(<DatasetAccessRequest dataset={DATASET} onClose={onClose} />);

    await send();

    // The test double of t does not fill in {{reason}}
    expect(screen.getByTestId('send-error')).toHaveTextContent("Couldn't send the request: {{reason}}");
    expect(screen.getByTestId('request-form')).toBeInTheDocument();
  });

  it('says a refusal without a response in words of its own, and clears it on the next send', async () => {
    createAccessRequest.mockRejectedValueOnce({ status: 0, body: undefined });
    createAccessRequest.mockResolvedValueOnce({ id: 'request-1', status: 'pending', createdAt: '2026-11-27T10:00:00Z' });
    render(<DatasetAccessRequest dataset={DATASET} onClose={onClose} />);

    await send();
    expect(screen.getByTestId('send-error')).toHaveTextContent("Couldn't send the request. Please try again.");

    await send();
    expect(screen.getByTestId('status-sent')).toBeInTheDocument();
  });
});
