import { render, screen } from '@testing-library/react';
import { FilterSection } from 'components/AdminPortal/RasterFilterForm/FilterSection/FilterSection';

describe('FilterSection', () => {
  it('renders the title, the message and the content', () => {
    render(
      <FilterSection title="Filter description" message="Add some general data">
        <div data-testid="content" />
      </FilterSection>,
    );

    expect(screen.getByRole('heading', { name: 'Filter description' })).toBeInTheDocument();
    expect(screen.getByText('Add some general data')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('renders the actions when given', () => {
    render(
      <FilterSection title="Title" message="Message" actions={<button>Install filter</button>}>
        <div />
      </FilterSection>,
    );

    expect(screen.getByRole('button', { name: 'Install filter' })).toBeInTheDocument();
  });

  it('renders no action bar without actions', () => {
    const { container } = render(
      <FilterSection title="Title" message="Message">
        <div />
      </FilterSection>,
    );

    expect(container.querySelector('.Actions')).not.toBeInTheDocument();
  });
});
