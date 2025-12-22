import { fireEvent, render, screen } from '@testing-library/react';
import { FilteringSidebarHeader } from 'components/FilteringSidebar/FilteringSidebarHeader/FilteringSidebarHeader';

jest.mock('components/FilteringSidebar/FiltersCounter/FiltersCounter', () => ({
  FiltersCounter: () => <div data-testid="mock-filters-counter">Mock FiltersCounter</div>,
}));

describe('FilteringSidebarHeader', () => {
  it('renders sidebar header', () => {
    const { container } = render(<FilteringSidebarHeader onClose={() => {}} />);

    expect(container).toMatchSnapshot();
  });

  it('calls onClose when header is clicked', async () => {
    const onClose = jest.fn();

    render(<FilteringSidebarHeader onClose={onClose} />);

    fireEvent.click(screen.getByTestId('sh-filtering-sidebar-header'));
    expect(onClose).toHaveBeenCalled();
  });
});
