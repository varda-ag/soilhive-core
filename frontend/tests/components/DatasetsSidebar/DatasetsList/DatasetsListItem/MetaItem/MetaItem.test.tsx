import { render, screen } from '@testing-library/react';
import { MetaItem } from 'components/DatasetsSidebar/DatasetsList/DatasetsListItem/MetaItem/MetaItem';

const MockIcon = () => <svg data-testid="mock-icon" />;

describe('MetaItem', () => {
  it('renders icon and children', () => {
    const { container } = render(<MetaItem icon={<MockIcon />}>some content</MetaItem>);

    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
    expect(screen.getByText('some content')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('shows skeleton and hides children when isLoading is true', () => {
    const { container } = render(
      <MetaItem icon={<MockIcon />} isLoading>
        some content
      </MetaItem>,
    );

    expect(container.querySelector('.react-loading-skeleton')).toBeTruthy();
    expect(screen.queryByText('some content')).not.toBeInTheDocument();
  });

  it('always renders the icon regardless of isLoading', () => {
    render(
      <MetaItem icon={<MockIcon />} isLoading>
        some content
      </MetaItem>,
    );

    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  it('shows children and hides skeleton when isLoading is false', () => {
    const { container } = render(
      <MetaItem icon={<MockIcon />} isLoading={false}>
        some content
      </MetaItem>,
    );

    expect(container.querySelector('.react-loading-skeleton')).not.toBeTruthy();
    expect(screen.getByText('some content')).toBeInTheDocument();
  });
});
