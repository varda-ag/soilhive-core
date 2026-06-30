import { render, screen } from '@testing-library/react';
import { InfoCard } from 'components/UI/InfoCard/InfoCard';

jest.mock('react-loading-skeleton', () => ({
  __esModule: true,
  default: () => <span data-testid="skeleton" />,
}));

const primaryContent = { value: 42, description: 'Primary description', color: '#A2D141' };
const secondaryContent = { value: 7, description: 'Secondary description', color: '#BC001F' };

describe('InfoCard', () => {
  describe('rendering', () => {
    it('renders the title', () => {
      render(<InfoCard title="My Card" primaryContent={primaryContent} />);
      expect(screen.getByRole('heading', { level: 3, name: 'My Card' })).toBeInTheDocument();
    });

    it('renders the primary value', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} />);
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders the primary description', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} />);
      expect(screen.getByText('Primary description')).toBeInTheDocument();
    });

    it('renders the primary value with the configured color', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} />);
      const value = screen.getByText('42');
      expect(value).toHaveStyle({ color: '#A2D141' });
    });

    it('does not render secondary content when omitted', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} />);
      expect(screen.queryByText('Secondary description')).not.toBeInTheDocument();
    });

    it('has the sh-ui-infocard test id', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} />);
      expect(screen.getByTestId('sh-ui-infocard')).toBeInTheDocument();
    });
  });

  describe('secondary content', () => {
    it('renders the secondary value when provided', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} secondaryContent={secondaryContent} />);
      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('renders the secondary description when provided', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} secondaryContent={secondaryContent} />);
      expect(screen.getByText('Secondary description')).toBeInTheDocument();
    });

    it('renders the secondary value with the configured color', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} secondaryContent={secondaryContent} />);
      expect(screen.getByText('7')).toHaveStyle({ color: '#BC001F' });
    });

    it('applies the Multicolumn class when secondary content is provided', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} secondaryContent={secondaryContent} />);
      expect(screen.getByTestId('sh-ui-infocard')).toHaveClass('Multicolumn');
    });

    it('does not apply the Multicolumn class without secondary content', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} />);
      expect(screen.getByTestId('sh-ui-infocard')).not.toHaveClass('Multicolumn');
    });
  });

  describe('isLoading', () => {
    it('hides the primary value and shows a skeleton when isLoading is true', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} isLoading />);
      expect(screen.queryByText('42')).not.toBeInTheDocument();
      expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    });

    it('hides secondary value and shows a skeleton when isLoading is true', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} secondaryContent={secondaryContent} isLoading />);
      expect(screen.queryByText('7')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('skeleton')).toHaveLength(2);
    });

    it('still renders the title and descriptions while loading', () => {
      render(<InfoCard title="My Card" primaryContent={primaryContent} isLoading />);
      expect(screen.getByRole('heading', { level: 3, name: 'My Card' })).toBeInTheDocument();
      expect(screen.getByText('Primary description')).toBeInTheDocument();
    });

    it('shows the primary value and no skeleton when isLoading is false', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} isLoading={false} />);
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });

    it('shows values and no skeleton when isLoading is omitted', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} />);
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });
  });

  describe('className prop', () => {
    it('applies the custom className to the root element', () => {
      render(<InfoCard title="Card" primaryContent={primaryContent} className="my-custom-class" />);
      expect(screen.getByTestId('sh-ui-infocard')).toHaveClass('my-custom-class');
    });
  });

  it('matches snapshot without secondary content', () => {
    const { container } = render(<InfoCard title="Card" primaryContent={primaryContent} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with secondary content', () => {
    const { container } = render(<InfoCard title="Card" primaryContent={primaryContent} secondaryContent={secondaryContent} />);
    expect(container).toMatchSnapshot();
  });
});
