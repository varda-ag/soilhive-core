import { fireEvent, render, screen } from '@testing-library/react';
import { DatasetsSidebarHeader } from 'components/DatasetsSidebar/DatasetsSidebarHeader/DatasetsSidebarHeader';

describe('DatasetsSidebarHeader', () => {
  it('renders sidebar header', () => {
    const { container } = render(<DatasetsSidebarHeader onClose={() => {}} />);

    expect(container).toMatchSnapshot();
  });

  it('calls onClose when header is clicked', async () => {
    const onClose = jest.fn();

    render(<DatasetsSidebarHeader onClose={onClose} />);

    fireEvent.click(screen.getByTestId('sh-datasets-sidebar-header'));
    expect(onClose).toHaveBeenCalled();
  });
});
