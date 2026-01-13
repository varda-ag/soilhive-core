import { fireEvent, render, screen } from '@testing-library/react';
import { FilteringSidebarParameters } from 'components/FilteringSidebar/FilteringSidebarParameters/FilteringSidebarParameters';
import type { NestedCheckboxItemType } from 'types/components';

jest.mock('components/UI', () => ({
  Accordion: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="accordion">
      <div data-testid="accordion-title">{title}</div>
      <div data-testid="accordion-content">{children}</div>
    </div>
  ),
  NestedCheckbox: ({
    items,
    selected,
    onChange,
  }: {
    items: NestedCheckboxItemType[];
    selected: string[];
    onChange: (selected: string[]) => void;
  }) => (
    <div data-testid="nested-checkbox">
      <div data-testid="nested-checkbox-items">{JSON.stringify(items)}</div>
      <div data-testid="nested-checkbox-selected">{JSON.stringify(selected)}</div>
      <button data-testid="nested-checkbox-change" onClick={() => onChange([items[0].id])} />
    </div>
  ),
}));

describe('FilteringSidebarParameters', () => {
  it('renders four accordion components', () => {
    const { container } = render(<FilteringSidebarParameters />);

    const accordions = screen.getAllByTestId('accordion');
    expect(accordions).toHaveLength(4);
    expect(container).toMatchSnapshot();
  });

  it('changes selected parameters on the nested checbox component change', () => {
    render(<FilteringSidebarParameters />);

    fireEvent.click(screen.getByTestId('nested-checkbox-change'));

    expect(screen.getByTestId('nested-checkbox-selected')).toHaveTextContent('["1"]');
  });
});
