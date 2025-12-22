import { render, screen } from '@testing-library/react';
import { FilteringSidebarLandEcosystem } from 'components/FilteringSidebar/FilteringSidebarLandEcosystem/FilteringSidebarLandEcosystem';

jest.mock('components/UI', () => ({
  Accordion: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="accordion">
      <div data-testid="accordion-title">{title}</div>
      <div data-testid="accordion-content">{children}</div>
    </div>
  ),
}));

describe('FilteringSidebarLandEcosystem', () => {
  it('renders two accordion components', () => {
    const { container } = render(<FilteringSidebarLandEcosystem />);

    const accordions = screen.getAllByTestId('accordion');
    expect(accordions).toHaveLength(2);
    expect(container).toMatchSnapshot();
  });
});
