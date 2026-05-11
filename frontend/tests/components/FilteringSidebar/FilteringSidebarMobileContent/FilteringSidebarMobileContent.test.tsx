import { fireEvent, render, screen } from '@testing-library/react';
import { FilteringSidebarMobileContent } from 'components/FilteringSidebar/FilteringSidebarMobileContent/FilteringSidebarMobileContent';

jest.mock('components/FilteringSidebar/FilteringSidebarParameters/FilteringSidebarParameters', () => ({
  FilteringSidebarParameters: () => <div data-testid="mock-filtering-sidebar-parameters">Mock FilteringSidebarParameters</div>,
}));

jest.mock('components/FilteringSidebar/FilteringSidebarDataScope/FilteringSidebarDataScope', () => ({
  FilteringSidebarDataScope: () => <div data-testid="mock-filtering-sidebar-datascope">Mock FilteringSidebarDataScope</div>,
}));

jest.mock('components/FilteringSidebar/FilteringSidebarLandEcosystem/FilteringSidebarLandEcosystem', () => ({
  FilteringSidebarLandEcosystem: () => <div data-testid="mock-filtering-sidebar-land-ecosystem">Mock FilteringSidebarLandEcosystem</div>,
}));

describe('FilteringSidebarMobileContent', () => {
  it('renders component by default', () => {
    const { container } = render(<FilteringSidebarMobileContent />);

    expect(container).toMatchSnapshot();
  });

  it('changes tabs by clicking on mobile navigation', () => {
    render(<FilteringSidebarMobileContent />);

    expect(screen.getByTestId('mock-filtering-sidebar-datascope')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-filtering-sidebar-parameters')).not.toBeInTheDocument();

    const navButtons = screen.getAllByTestId('sh-ui-mobile-tab-navigation-item');
    fireEvent.click(navButtons[1]);

    expect(screen.queryByTestId('mock-filtering-sidebar-datascope')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar-parameters')).toBeInTheDocument();
  });
});
