import { render, screen } from '@testing-library/react';
import { DatasetsTableStatusTemplate } from 'components/AdminPortal/DatasetsPublicationTable/DatasetsTableStatusTemplate/DatasetsTableStatusTemplate';
import { IngestionStatus } from 'types/backend';

jest.mock('components/UI', () => ({
  Tag: ({ text, className }: any) => (
    <span data-testid="mock-tag" className={className}>
      {text}
    </span>
  ),
}));

describe('DatasetsTableStatusTemplate', () => {
  it('renders the translated status text for PENDING', () => {
    render(<DatasetsTableStatusTemplate status={IngestionStatus.PENDING} />);

    expect(screen.getByTestId('mock-tag')).toHaveTextContent('Draft');
  });

  it('renders the translated status text for ONGOING', () => {
    render(<DatasetsTableStatusTemplate status={IngestionStatus.ONGOING} />);

    expect(screen.getByTestId('mock-tag')).toHaveTextContent('Loading');
  });

  it('renders the translated status text for LOADED', () => {
    render(<DatasetsTableStatusTemplate status={IngestionStatus.LOADED} />);

    expect(screen.getByTestId('mock-tag')).toHaveTextContent('Loaded');
  });

  it('renders the translated status text for PUBLISHED', () => {
    render(<DatasetsTableStatusTemplate status={IngestionStatus.PUBLISHED} />);

    expect(screen.getByTestId('mock-tag')).toHaveTextContent('Published');
  });

  it('applies status-specific className to the tag', () => {
    render(<DatasetsTableStatusTemplate status={IngestionStatus.LOADED} />);

    expect(screen.getByTestId('mock-tag')).toHaveClass('LOADED');
  });
});
