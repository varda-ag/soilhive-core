import { render } from '@testing-library/react';
import { FiltersCounter } from 'components/FilteringSidebar/FiltersCounter/FiltersCounter';

describe('FiltersCounter', () => {
  it('renders filters counter', () => {
    const { container } = render(<FiltersCounter />);

    expect(container).toMatchSnapshot();
  });
});
