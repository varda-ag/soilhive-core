import { render, screen } from '@testing-library/react';
import { DatasetsSidebarSummaryItem } from 'components/DatasetsSidebar/DatasetsSidebarSummary/DatasetsSidebarSummaryItem/DatasetsSidebarSummaryItem';

describe('DatasetsSidebarSummaryItem', () => {
  it('renders summary item', () => {
    const { container } = render(<DatasetsSidebarSummaryItem name="test" value="25" color="#00AB00" />);

    expect(screen.getByTestId('sh-datasets-sidebar-summary-item')).not.toHaveClass('Preview');
    expect(container).toMatchSnapshot();
  });

  it('applies Preview class when preview prop is true', () => {
    render(<DatasetsSidebarSummaryItem name="test" value="25" color="#00AB00" preview />);

    expect(screen.getByTestId('sh-datasets-sidebar-summary-item')).toHaveClass('Preview');
  });
});
