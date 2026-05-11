import { render } from '@testing-library/react';
import { FiltersCounter } from 'components/FilteringSidebar/FiltersCounter/FiltersCounter';
import useAvailability from 'hooks/useAvailability';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('FiltersCounter', () => {
  beforeEach(() => {
    (useAvailability as jest.Mock).mockReturnValue({
      appliedFiltersCount: 3,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders filters counter', () => {
    const { container } = render(<FiltersCounter />);

    expect(container).toMatchSnapshot();
  });
});
