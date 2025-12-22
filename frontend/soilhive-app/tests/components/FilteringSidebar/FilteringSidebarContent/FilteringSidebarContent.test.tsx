import { render, screen } from '@testing-library/react';
import { FilteringSidebarContent } from 'components/FilteringSidebar/FilteringSidebarContent/FilteringSidebarContent';

jest.mock('components/UI', () => ({
  Accordion: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="accordion">
      <div data-testid="accordion-title">{title}</div>
      <div data-testid="accordion-content">{children}</div>
    </div>
  ),
}));

jest.mock('components/FilteringSidebar/FilteringSidebarParameters/FilteringSidebarParameters', () => ({
  FilteringSidebarParameters: () => <div data-testid="mock-filtering-sidebar-parameters">Mock FilteringSidebarParameters</div>,
}));

jest.mock('components/FilteringSidebar/FilteringSidebarDataScope/FilteringSidebarDataScope', () => ({
  FilteringSidebarDataScope: () => <div data-testid="mock-filtering-sidebar-datascope">Mock FilteringSidebarDataScope</div>,
}));

jest.mock('components/FilteringSidebar/FilteringSidebarLandEcosystem/FilteringSidebarLandEcosystem', () => ({
  FilteringSidebarLandEcosystem: () => <div data-testid="mock-filtering-sidebar-landecosystem">Mock FilteringSidebarLandEcosystem</div>,
}));

describe('FilteringSidebarContent', () => {
  it('renders three accordion components', () => {
    const { container } = render(<FilteringSidebarContent />);

    const accordions = screen.getAllByTestId('accordion');
    expect(accordions).toHaveLength(3);
    expect(screen.getByTestId('mock-filtering-sidebar-parameters')).toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar-datascope')).toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar-landecosystem')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });
});
