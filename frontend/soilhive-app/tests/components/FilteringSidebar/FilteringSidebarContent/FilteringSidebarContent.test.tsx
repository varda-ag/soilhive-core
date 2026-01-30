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

describe('FilteringSidebarContent', () => {
  it('renders three accordion components', () => {
    const { container } = render(<FilteringSidebarContent />);

    const accordions = screen.getAllByTestId('accordion');
    expect(accordions).toHaveLength(2);
    expect(screen.getByTestId('mock-filtering-sidebar-parameters')).toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar-datascope')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });
});
