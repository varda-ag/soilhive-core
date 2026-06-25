import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsTableStatusTemplate } from 'components/AdminPortal/DatasetsPublicationTable/DatasetsTableStatusTemplate/DatasetsTableStatusTemplate';
import { IngestionStatus } from 'types/backend';
import type { DatasetsPublicationListItem } from 'types/datasetsPublication';

jest.mock('components/UI', () => ({
  Tag: ({ text, className }: any) => (
    <span data-testid="mock-tag" className={className}>
      {text}
    </span>
  ),
}));

const makeDataset = (status: IngestionStatus, hasErrors = false): DatasetsPublicationListItem => ({
  id: '1',
  name: 'Test Dataset',
  status,
  updated_at: null,
  visibility: 'public',
  hasErrors,
});

describe('DatasetsTableStatusTemplate', () => {
  const onShowErrors = jest.fn();

  afterEach(() => jest.clearAllMocks());

  it('renders the translated status text for PENDING', () => {
    render(<DatasetsTableStatusTemplate dataset={makeDataset(IngestionStatus.PENDING)} onShowErrors={onShowErrors} />);

    expect(screen.getByTestId('mock-tag')).toHaveTextContent('Draft');
  });

  it('renders the translated status text for ONGOING', () => {
    render(<DatasetsTableStatusTemplate dataset={makeDataset(IngestionStatus.ONGOING)} onShowErrors={onShowErrors} />);

    expect(screen.getByTestId('mock-tag')).toHaveTextContent('Loading');
  });

  it('renders the translated status text for LOADED', () => {
    render(<DatasetsTableStatusTemplate dataset={makeDataset(IngestionStatus.LOADED)} onShowErrors={onShowErrors} />);

    expect(screen.getByTestId('mock-tag')).toHaveTextContent('Loaded');
  });

  it('renders the translated status text for PUBLISHED', () => {
    render(<DatasetsTableStatusTemplate dataset={makeDataset(IngestionStatus.PUBLISHED)} onShowErrors={onShowErrors} />);

    expect(screen.getByTestId('mock-tag')).toHaveTextContent('Published');
  });

  it('applies status-specific className to the tag', () => {
    render(<DatasetsTableStatusTemplate dataset={makeDataset(IngestionStatus.LOADED)} onShowErrors={onShowErrors} />);

    expect(screen.getByTestId('mock-tag')).toHaveClass('LOADED');
  });

  it('does not render error link when hasErrors is false', () => {
    render(<DatasetsTableStatusTemplate dataset={makeDataset(IngestionStatus.PENDING, false)} onShowErrors={onShowErrors} />);

    expect(screen.queryByText('Error details')).not.toBeInTheDocument();
  });

  it('renders error details link when hasErrors is true', () => {
    render(<DatasetsTableStatusTemplate dataset={makeDataset(IngestionStatus.PENDING, true)} onShowErrors={onShowErrors} />);

    expect(screen.getByText('Error details')).toBeInTheDocument();
  });

  it('calls onShowErrors with the dataset when error link is clicked', () => {
    const dataset = makeDataset(IngestionStatus.PENDING, true);
    render(<DatasetsTableStatusTemplate dataset={dataset} onShowErrors={onShowErrors} />);

    fireEvent.click(screen.getByText('Error details'));

    expect(onShowErrors).toHaveBeenCalledWith(dataset);
  });
});
