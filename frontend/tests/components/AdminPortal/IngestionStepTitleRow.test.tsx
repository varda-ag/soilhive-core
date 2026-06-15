import { render, screen } from '@testing-library/react';
import { IngestionStepTitleRow } from 'components/AdminPortal/IngestionStepTitleRow/IngestionStepTitleRow';

jest.mock('components/AdminPortal/DocumentationLink/DocumentationLink', () => ({
  DocumentationLink: ({ href }: { href: string }) => <a data-testid="documentation-link" href={href} />,
}));

describe('IngestionStepTitleRow', () => {
  it('matches the snapshot', () => {
    const { container } = render(<IngestionStepTitleRow title="General info" docsLink="https://docs.example.com" />);
    expect(container).toMatchSnapshot();
  });

  it('renders the title without DocumentationLink', () => {
    render(<IngestionStepTitleRow title="General info" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('General info');
    expect(screen.queryByTestId('documentation-link')).not.toBeInTheDocument();
  });

  it('renders DocumentationLink when docsLink is provided', () => {
    render(<IngestionStepTitleRow title="General info" docsLink="https://docs.example.com" />);
    expect(screen.getByTestId('documentation-link')).toHaveAttribute('href', 'https://docs.example.com');
  });

  it('applies the className prop to the root element', () => {
    const { container } = render(<IngestionStepTitleRow title="General info" className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
