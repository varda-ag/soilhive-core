import { render, screen } from '@testing-library/react';
import { FilteringSidebarDataScope } from 'components/FilteringSidebar/FilteringSidebarDataScope/FilteringSidebarDataScope';

jest.mock('components/UI', () => ({
  Accordion: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="accordion">
      <div data-testid="accordion-title">{title}</div>
      <div data-testid="accordion-content">{children}</div>
    </div>
  ),
}));

describe('FilteringSidebarDataScope', () => {
  it('renders two accordion components', () => {
    const { container } = render(<FilteringSidebarDataScope />);

    const accordions = screen.getAllByTestId('accordion');
    expect(accordions).toHaveLength(2);
    expect(container).toMatchSnapshot();
  });
});
