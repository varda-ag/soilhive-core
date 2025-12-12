import { render } from '@testing-library/react';
import { DatasetsSidebarSummaryItem } from 'components/DatasetsSidebar/DatasetsSidebarSummary/DatasetsSidebarSummaryItem/DatasetsSidebarSummaryItem';

describe('DatasetsSidebarSummaryItem', () => {
  it('renders summary item', () => {
    const { container } = render(<DatasetsSidebarSummaryItem name="test" value="25" color="#00AB00" />);

    expect(container).toMatchSnapshot();
  });
});
