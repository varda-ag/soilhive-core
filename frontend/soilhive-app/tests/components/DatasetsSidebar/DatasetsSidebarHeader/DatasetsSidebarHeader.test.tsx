import { fireEvent, render, screen } from '@testing-library/react';
import { DatasetsSidebarHeader } from 'components/DatasetsSidebar/DatasetsSidebarHeader/DatasetsSidebarHeader';

describe('DatasetsSidebarHeader', () => {
  it('renders sidebar header', () => {
    const { container } = render(<DatasetsSidebarHeader onClose={() => {}} />);

    expect(screen.getByTestId('sh-datasets-sidebar-header')).not.toHaveClass('Preview');
    expect(container).toMatchSnapshot();
  });

  it('calls onClose when header is clicked', async () => {
    const onClose = jest.fn();

    render(<DatasetsSidebarHeader onClose={onClose} />);

    fireEvent.click(screen.getByTestId('sh-datasets-sidebar-header'));
    expect(onClose).toHaveBeenCalled();
  });

  it('applies Preview class when preview prop is true', () => {
    render(<DatasetsSidebarHeader preview />);

    expect(screen.getByTestId('sh-datasets-sidebar-header')).toHaveClass('Preview');
  });
});
