import { render, screen } from '@testing-library/react';
import { FilteringSidebarContent } from 'components/FilteringSidebar/FilteringSidebarContent/FilteringSidebarContent';

jest.mock('components/FilteringSidebar/FilteringSidebarParameters/FilteringSidebarParameters', () => ({
  FilteringSidebarParameters: () => <div data-testid="mock-filtering-sidebar-parameters">Mock FilteringSidebarParameters</div>,
}));

jest.mock('components/FilteringSidebar/FilteringSidebarDataScope/FilteringSidebarDataScope', () => ({
  FilteringSidebarDataScope: () => <div data-testid="mock-filtering-sidebar-datascope">Mock FilteringSidebarDataScope</div>,
}));

describe('FilteringSidebarContent', () => {
  it('renders two sections with child components', () => {
    const { container } = render(<FilteringSidebarContent />);

    const sections = screen.getAllByTestId('sh-filtering-sidebar-section');
    expect(sections).toHaveLength(2);
    expect(screen.getByTestId('mock-filtering-sidebar-parameters')).toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar-datascope')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });
});
