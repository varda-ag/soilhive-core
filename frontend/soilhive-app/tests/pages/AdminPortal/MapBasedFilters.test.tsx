import { render } from '@testing-library/react';
import { MapBasedFilters } from '../../../src/pages/AdminPortal/MapBasedFilters/MapBasedFilters';

describe('MapBasedFilters page', () => {
  it('matches snapshot', () => {
    const { container } = render(<MapBasedFilters />);
    expect(container).toMatchSnapshot();
  });
});
